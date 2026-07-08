/**
 * Dispositivo simulado para verificar el relay + dashboard sin un teléfono real.
 * Uso: `npm run mock-device` (con el server corriendo).
 */
import { WebSocket } from 'ws';
import zlib from 'node:zlib';
import { config } from './config.js';
import { BIN } from './protocol.js';

/** Genera un PNG RGB válido (degradado) — imagen real para validar el render. */
function makePng(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filtro none
    for (let x = 0; x < w; x++) {
      raw[o++] = (x * 6) & 255;
      raw[o++] = (y * 3) & 255;
      raw[o++] = 140;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Imagen de prueba válida (los dispositivos reales envían JPEG; el navegador
// detecta el formato por contenido, así que un PNG sirve para el mock).
const TEST_IMG = makePng(108, 240);

const port = config.port;
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/device`);
let timer: NodeJS.Timeout | null = null;

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      type: 'register',
      token: config.enrollToken,
      deviceId: 'mock-1',
      model: 'Mock Pixel 8',
      androidVersion: '14',
      width: 1080,
      height: 2400,
    }),
  );
  console.log('[mock] registrado como mock-1');
  setInterval(() => ws.send(JSON.stringify({ type: 'status', battery: 87, charging: false })), 5000);
});

function sendBlob(requestId: string, bytes: Buffer): void {
  const reqId = Buffer.from(requestId, 'utf8');
  const head = Buffer.from([BIN.BLOB, reqId.length]);
  const meta = Buffer.alloc(5);
  meta.writeUInt32BE(0, 0); // chunkIndex
  meta.writeUInt8(1, 4); // last
  ws.send(Buffer.concat([head, reqId, meta, bytes]), { binary: true });
}

ws.on('message', (raw, isBinary) => {
  if (isBinary) return;
  const msg = JSON.parse(raw.toString());
  switch (msg.type) {
    case 'subscribe':
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        ws.send(Buffer.concat([Buffer.from([BIN.JPEG]), TEST_IMG]), { binary: true });
      }, 500);
      console.log('[mock] streaming iniciado');
      break;
    case 'unsubscribe':
      if (timer) clearInterval(timer);
      timer = null;
      console.log('[mock] streaming detenido');
      break;
    case 'tap':
      console.log(`[mock] tap ${msg.x},${msg.y}`);
      break;
    case 'swipe':
      console.log(`[mock] swipe ${msg.x1},${msg.y1} -> ${msg.x2},${msg.y2}`);
      break;
    case 'text':
      console.log(`[mock] text "${msg.text}"`);
      break;
    case 'key':
      console.log(`[mock] key ${msg.key}`);
      break;
    case 'gallery:req': {
      ws.send(
        JSON.stringify({
          type: 'gallery:list',
          requestId: msg.requestId,
          total: 2,
          items: [
            { id: 'p1', name: 'IMG_001.jpg', width: 4000, height: 3000, sizeBytes: 2500000, dateTaken: Date.now() - 86400000 },
            { id: 'p2', name: 'IMG_002.jpg', width: 4000, height: 3000, sizeBytes: 2100000, dateTaken: Date.now() - 3600000 },
          ],
        }),
      );
      sendBlob(`thumb:p1`, TEST_IMG);
      sendBlob(`thumb:p2`, TEST_IMG);
      break;
    }
    case 'photo:req':
      sendBlob(`photo:${msg.id}`, TEST_IMG);
      break;
    case 'file:req':
      ws.send(
        JSON.stringify({
          type: 'file:list',
          requestId: msg.requestId,
          path: msg.path || '/sdcard',
          entries: [
            { name: 'DCIM', path: '/sdcard/DCIM', isDir: true, sizeBytes: 0, modified: Date.now() },
            { name: 'Download', path: '/sdcard/Download', isDir: true, sizeBytes: 0, modified: Date.now() },
            { name: 'nota.txt', path: '/sdcard/nota.txt', isDir: false, sizeBytes: 128, modified: Date.now() },
          ],
        }),
      );
      break;
    case 'file:download':
      sendBlob(`file:${msg.path}`, Buffer.from('contenido de prueba\n'));
      break;
    default:
      break;
  }
});

ws.on('close', () => {
  if (timer) clearInterval(timer);
  console.log('[mock] conexión cerrada');
  process.exit(0);
});
ws.on('error', (e) => console.error('[mock] error', e.message));
