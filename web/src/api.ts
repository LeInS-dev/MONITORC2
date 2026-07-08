import {
  BIN,
  parseBinary,
  parseBlob,
  type DevicePublic,
  type GalleryItem,
  type FileEntry,
  type KeyName,
} from './protocol';

/* ---------------- REST ---------------- */

export async function login(password: string): Promise<boolean> {
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  return r.ok;
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
}

export async function checkAuth(): Promise<boolean> {
  const r = await fetch('/api/me', { credentials: 'include' });
  if (!r.ok) return false;
  const j = (await r.json()) as { authenticated: boolean };
  return j.authenticated;
}

/* ---------------- WebSocket del operador ---------------- */

type Events = {
  devices: (d: DevicePublic[]) => void;
  'device:added': (d: DevicePublic) => void;
  'device:removed': (deviceId: string) => void;
  'device:status': (deviceId: string, battery?: number, charging?: boolean) => void;
  'gallery:list': (requestId: string, total: number, items: GalleryItem[]) => void;
  'file:list': (requestId: string, path: string, entries: FileEntry[]) => void;
  /** frame de vídeo (JPEG o H.264) para un dispositivo. */
  video: (deviceId: string, type: number, payload: Uint8Array) => void;
  /** blob correlacionado (thumbnail/foto/archivo). */
  blob: (reqId: string, bytes: Uint8Array, last: boolean) => void;
  open: () => void;
  close: () => void;
};

export class OperatorClient {
  private ws: WebSocket | null = null;
  private handlers: { [K in keyof Events]: Set<Events[K]> } = {
    devices: new Set(),
    'device:added': new Set(),
    'device:removed': new Set(),
    'device:status': new Set(),
    'gallery:list': new Set(),
    'file:list': new Set(),
    video: new Set(),
    blob: new Set(),
    open: new Set(),
    close: new Set(),
  };
  private reconnectTimer: number | null = null;
  private shouldRun = false;

  on<K extends keyof Events>(event: K, cb: Events[K]): () => void {
    this.handlers[event].add(cb);
    return () => this.handlers[event].delete(cb);
  }

  private emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    for (const cb of this.handlers[event]) (cb as (...a: unknown[]) => void)(...args);
  }

  connect(): void {
    this.shouldRun = true;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/operator`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => this.emit('open');
    ws.onclose = () => {
      this.emit('close');
      if (this.shouldRun) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        this.handleBinary(ev.data);
        return;
      }
      this.handleJson(ev.data as string);
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldRun) this.connect();
    }, 1500);
  }

  disconnect(): void {
    this.shouldRun = false;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private handleBinary(buf: ArrayBuffer): void {
    const parsed = parseBinary(buf);
    if (!parsed) return;
    if (parsed.type === BIN.BLOB) {
      const blob = parseBlob(parsed.payload);
      if (blob) this.emit('blob', blob.reqId, blob.bytes, blob.last);
      return;
    }
    // JPEG / H264
    this.emit('video', parsed.deviceId, parsed.type, parsed.payload);
  }

  private handleJson(raw: string): void {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.type) {
      case 'devices':
        this.emit('devices', m.devices as DevicePublic[]);
        break;
      case 'device:added':
        this.emit('device:added', m.device as DevicePublic);
        break;
      case 'device:removed':
        this.emit('device:removed', m.deviceId as string);
        break;
      case 'device:status':
        this.emit('device:status', m.deviceId as string, m.battery as number, m.charging as boolean);
        break;
      case 'gallery:list':
        this.emit('gallery:list', m.requestId as string, m.total as number, m.items as GalleryItem[]);
        break;
      case 'file:list':
        this.emit('file:list', m.requestId as string, m.path as string, m.entries as FileEntry[]);
        break;
      default:
        break;
    }
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  subscribe(deviceId: string, mode: 'thumb' | 'full'): void {
    this.send({ type: 'subscribe', deviceId, mode });
  }
  unsubscribe(deviceId: string): void {
    this.send({ type: 'unsubscribe', deviceId });
  }
  tap(deviceId: string, x: number, y: number): void {
    this.send({ type: 'tap', deviceId, x: Math.round(x), y: Math.round(y) });
  }
  swipe(deviceId: string, x1: number, y1: number, x2: number, y2: number, durationMs: number): void {
    this.send({
      type: 'swipe',
      deviceId,
      x1: Math.round(x1),
      y1: Math.round(y1),
      x2: Math.round(x2),
      y2: Math.round(y2),
      durationMs,
    });
  }
  text(deviceId: string, text: string): void {
    this.send({ type: 'text', deviceId, text });
  }
  key(deviceId: string, key: KeyName): void {
    this.send({ type: 'key', deviceId, key });
  }
  galleryReq(deviceId: string, requestId: string, offset: number, limit: number): void {
    this.send({ type: 'gallery:req', deviceId, requestId, offset, limit });
  }
  photoReq(deviceId: string, requestId: string, id: string): void {
    this.send({ type: 'photo:req', deviceId, requestId, id });
  }
  fileReq(deviceId: string, requestId: string, path: string): void {
    this.send({ type: 'file:req', deviceId, requestId, path });
  }
  fileDownload(deviceId: string, requestId: string, path: string): void {
    this.send({ type: 'file:download', deviceId, requestId, path });
  }
}
