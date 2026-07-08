import type { OperatorClient } from './api';

/** Acumula chunks de BLOB por reqId y llama al callback cuando llega el último. */
export class BlobCollector {
  private chunks = new Map<string, Uint8Array[]>();
  private cbs = new Map<string, (bytes: Uint8Array) => void>();

  constructor(client: OperatorClient) {
    client.on('blob', (reqId, bytes, last) => {
      const arr = this.chunks.get(reqId) ?? [];
      arr.push(bytes);
      this.chunks.set(reqId, arr);
      if (!last) return;
      const total = arr.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of arr) {
        merged.set(c, off);
        off += c.length;
      }
      this.chunks.delete(reqId);
      const cb = this.cbs.get(reqId);
      if (cb) {
        this.cbs.delete(reqId);
        cb(merged);
      }
    });
  }

  /** Registra un handler para cuando se complete el blob con ese reqId. */
  expect(reqId: string, cb: (bytes: Uint8Array) => void): void {
    this.cbs.set(reqId, cb);
  }
}

export function bytesToObjectUrl(bytes: Uint8Array, mime: string): string {
  // Copia respaldada por un ArrayBuffer propio (evita issues de SharedArrayBuffer en el tipo Blob).
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
}
