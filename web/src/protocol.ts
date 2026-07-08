// Espejo (lado navegador) del protocolo del servidor. Mantener en sync con
// server/src/protocol.ts.

export const BIN = {
  JPEG: 1,
  H264_CONFIG: 2,
  H264_KEY: 3,
  H264_DELTA: 4,
  BLOB: 10,
} as const;

export type KeyName =
  | 'back'
  | 'home'
  | 'recents'
  | 'power'
  | 'volup'
  | 'voldown'
  | 'enter'
  | 'delete';

export interface DevicePublic {
  deviceId: string;
  model: string;
  androidVersion: string;
  width: number;
  height: number;
  battery?: number;
  charging?: boolean;
  connectedAt: number;
}

export interface GalleryItem {
  id: string;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  dateTaken: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes: number;
  modified: number;
}

/** Trama binaria del servidor: [type][idLen][deviceId][payload]. */
export interface ParsedBinary {
  type: number;
  deviceId: string;
  payload: Uint8Array;
}

export function parseBinary(buf: ArrayBuffer): ParsedBinary | null {
  const view = new Uint8Array(buf);
  if (view.length < 2) return null;
  const type = view[0];
  const idLen = view[1];
  if (view.length < 2 + idLen) return null;
  const deviceId = new TextDecoder().decode(view.subarray(2, 2 + idLen));
  const payload = view.subarray(2 + idLen);
  return { type, deviceId, payload };
}

/** Payload de BLOB: [reqIdLen][reqId][chunkIndex u32][last u8][bytes]. */
export interface ParsedBlob {
  reqId: string;
  chunkIndex: number;
  last: boolean;
  bytes: Uint8Array;
}

export function parseBlob(payload: Uint8Array): ParsedBlob | null {
  if (payload.length < 1) return null;
  const reqIdLen = payload[0];
  let off = 1;
  if (payload.length < off + reqIdLen + 5) return null;
  const reqId = new TextDecoder().decode(payload.subarray(off, off + reqIdLen));
  off += reqIdLen;
  const dv = new DataView(payload.buffer, payload.byteOffset + off, 5);
  const chunkIndex = dv.getUint32(0, false);
  const last = dv.getUint8(4) === 1;
  off += 5;
  const bytes = payload.subarray(off);
  return { reqId, chunkIndex, last, bytes };
}
