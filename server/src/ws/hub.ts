import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { config } from '../config.js';
import { registry } from '../registry.js';
import { verifyOperatorToken, tokenFromCookieHeader } from '../http/auth.js';
import {
  BIN,
  type DevicePublic,
  type ServerToOperator,
  type RegisterMsg,
  type OperatorToServer,
  wrapForOperator,
} from '../protocol.js';

const deviceWss = new WebSocketServer({ noServer: true });
const operatorWss = new WebSocketServer({ noServer: true });

function sendJson(ws: WebSocket, msg: ServerToOperator | Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastToOperators(msg: ServerToOperator): void {
  const data = JSON.stringify(msg);
  for (const op of registry.operatorsList()) {
    if (op.readyState === WebSocket.OPEN) op.send(data);
  }
}

/* ---------------- Conexiones de DISPOSITIVO ---------------- */

deviceWss.on('connection', (ws: WebSocket) => {
  let deviceId: string | null = null;
  let registered = false;

  ws.on('message', (raw: RawData, isBinary: boolean) => {
    // Media binaria → reenviar a los operadores suscritos.
    if (isBinary) {
      if (!registered || !deviceId) return;
      const buf = raw as Buffer;
      if (buf.length < 1) return;
      const type = buf[0];
      const payload = buf.subarray(1);
      const wrapped = wrapForOperator(type, deviceId, payload);
      const conn = registry.getDevice(deviceId);
      if (!conn) return;
      if (type === BIN.BLOB) {
        // Respuestas correlacionadas (thumbnails/fotos/archivos): a TODOS los
        // operadores (filtran por reqId), independientemente de la suscripción de vídeo.
        for (const op of registry.operatorsList()) {
          if (op.readyState === WebSocket.OPEN) op.send(wrapped, { binary: true });
        }
      } else {
        // Vídeo: solo a los operadores suscritos (ancho de banda).
        for (const sub of conn.subscribers) {
          if (sub.readyState === WebSocket.OPEN) sub.send(wrapped, { binary: true });
        }
      }
      return;
    }

    // Control/metadatos (JSON).
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!registered) {
      if (msg.type !== 'register') {
        sendJson(ws, { type: 'error', message: 'se esperaba register' });
        ws.close(4001, 'no registrado');
        return;
      }
      const r = msg as unknown as RegisterMsg;
      if (r.token !== config.enrollToken) {
        sendJson(ws, { type: 'error', message: 'token de enrolamiento inválido' });
        ws.close(4003, 'token inválido');
        return;
      }
      if (!r.deviceId) {
        ws.close(4002, 'deviceId requerido');
        return;
      }
      // Si ya existía una conexión con ese id, cerrar la vieja.
      const prev = registry.getDevice(r.deviceId);
      if (prev) prev.ws.close(4004, 'reemplazado por nueva conexión');

      deviceId = r.deviceId;
      registered = true;
      const info: DevicePublic = {
        deviceId: r.deviceId,
        model: r.model || 'desconocido',
        androidVersion: r.androidVersion || '?',
        width: r.width || 0,
        height: r.height || 0,
        connectedAt: Date.now(),
      };
      registry.addDevice({ ws, info, subscribers: new Set() });
      console.log(`[device] registrado ${info.model} (${deviceId}) ${info.width}x${info.height}`);
      broadcastToOperators({ type: 'device:added', device: info });
      return;
    }

    // Ya registrado: relay de respuestas hacia los operadores.
    switch (msg.type) {
      case 'status': {
        const conn = deviceId ? registry.getDevice(deviceId) : undefined;
        if (conn) {
          conn.info.battery = msg.battery as number | undefined;
          conn.info.charging = msg.charging as boolean | undefined;
        }
        broadcastToOperators({
          type: 'device:status',
          deviceId: deviceId!,
          battery: msg.battery as number | undefined,
          charging: msg.charging as boolean | undefined,
        });
        break;
      }
      case 'gallery:list':
      case 'file:list':
      case 'ack':
        // Respuestas correlacionadas por requestId → broadcast; el operador filtra.
        broadcastToOperators(msg as unknown as ServerToOperator);
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (deviceId) {
      registry.removeDevice(deviceId);
      console.log(`[device] desconectado ${deviceId}`);
      broadcastToOperators({ type: 'device:removed', deviceId });
    }
  });

  ws.on('error', () => {/* el close se maneja aparte */});
});

/* ---------------- Conexiones de OPERADOR ---------------- */

operatorWss.on('connection', (ws: WebSocket) => {
  registry.addOperator(ws);
  sendJson(ws, { type: 'devices', devices: registry.listDevices() });

  ws.on('message', (raw: RawData) => {
    let msg: OperatorToServer;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const device = registry.getDevice((msg as { deviceId: string }).deviceId);
    if (!device) {
      sendJson(ws, { type: 'error', message: 'dispositivo no conectado' });
      return;
    }

    switch (msg.type) {
      case 'subscribe':
        device.subscribers.add(ws);
        device.ws.send(JSON.stringify({ type: 'subscribe', mode: msg.mode }));
        break;
      case 'unsubscribe':
        device.subscribers.delete(ws);
        if (device.subscribers.size === 0) {
          device.ws.send(JSON.stringify({ type: 'unsubscribe' }));
        }
        break;
      default:
        // tap/swipe/text/key/gallery:req/photo:req/file:req/file:download → reenviar al device.
        device.ws.send(JSON.stringify(msg));
        break;
    }
  });

  ws.on('close', () => registry.removeOperator(ws));
  ws.on('error', () => {/* noop */});
});

/* ---------------- Enrutado del upgrade HTTP → WS ---------------- */

export function attachWebSockets(server: Server): void {
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const { url = '' } = req;
    const path = url.split('?')[0];

    if (path === '/ws/device') {
      deviceWss.handleUpgrade(req, socket, head, (ws) => deviceWss.emit('connection', ws, req));
      return;
    }
    if (path === '/ws/operator') {
      const token = tokenFromCookieHeader(req.headers.cookie);
      if (!verifyOperatorToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      operatorWss.handleUpgrade(req, socket, head, (ws) => operatorWss.emit('connection', ws, req));
      return;
    }
    socket.destroy();
  });
}
