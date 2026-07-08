import type { WebSocket } from 'ws';
import type { DevicePublic } from './protocol.js';

export interface DeviceConn {
  ws: WebSocket;
  info: DevicePublic;
  /** modo de suscripción agregado que el dispositivo debería estar enviando. */
  subscribers: Set<WebSocket>;
}

/** Registro en memoria de dispositivos conectados, indexado por deviceId. */
class Registry {
  private devices = new Map<string, DeviceConn>();
  private operators = new Set<WebSocket>();

  addDevice(conn: DeviceConn): void {
    this.devices.set(conn.info.deviceId, conn);
  }
  removeDevice(deviceId: string): DeviceConn | undefined {
    const c = this.devices.get(deviceId);
    this.devices.delete(deviceId);
    return c;
  }
  getDevice(deviceId: string): DeviceConn | undefined {
    return this.devices.get(deviceId);
  }
  listDevices(): DevicePublic[] {
    return [...this.devices.values()].map((d) => d.info);
  }

  addOperator(ws: WebSocket): void {
    this.operators.add(ws);
  }
  removeOperator(ws: WebSocket): void {
    this.operators.delete(ws);
    for (const d of this.devices.values()) d.subscribers.delete(ws);
  }
  operatorsList(): Set<WebSocket> {
    return this.operators;
  }
}

export const registry = new Registry();
