import { useRef, useState } from 'react';
import type { OperatorClient } from '../api';
import type { DevicePublic, KeyName } from '../protocol';
import { useDeviceStream } from '../hooks/useDeviceStream';

const TAP_MAX_MOVE = 12; // px en coords de pantalla del navegador
const TAP_MAX_MS = 250;

export function DeviceView({ client, device }: { client: OperatorClient; device: DevicePublic }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const [typed, setTyped] = useState('');
  const { fps } = useDeviceStream(client, device.deviceId, canvasRef, true);

  /** Convierte coords del ratón (px navegador) a píxeles del dispositivo. */
  function toDevice(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(device.width, nx * device.width)),
      y: Math.max(0, Math.min(device.height, ny * device.height)),
    };
  }

  function onDown(e: React.MouseEvent) {
    down.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onUp(e: React.MouseEvent) {
    const start = down.current;
    down.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    const dt = Date.now() - start.t;
    const a = toDevice(start.x, start.y);
    const b = toDevice(e.clientX, e.clientY);
    if (dist <= TAP_MAX_MOVE && dt <= TAP_MAX_MS) {
      client.tap(device.deviceId, b.x, b.y);
    } else {
      client.swipe(device.deviceId, a.x, a.y, b.x, b.y, Math.max(60, Math.min(1200, dt)));
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      client.key(device.deviceId, 'delete');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      client.key(device.deviceId, 'enter');
    } else if (e.key.length === 1) {
      e.preventDefault();
      client.text(device.deviceId, e.key);
    }
  }

  function sendKey(k: KeyName) {
    client.key(device.deviceId, k);
  }

  function sendTyped() {
    if (typed) {
      client.text(device.deviceId, typed);
      setTyped('');
    }
  }

  return (
    <div className="deviceview">
      <div className="dv-topbar">
        <span>
          {device.model} · {device.width}×{device.height}
        </span>
        <span className="muted">{fps} fps</span>
      </div>

      <div
        className="dv-screen"
        ref={wrapRef}
        tabIndex={0}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onKeyDown={onKeyDown}
        style={{ aspectRatio: `${device.width} / ${device.height}` }}
      >
        <canvas ref={canvasRef} />
        <div className="dv-hint">Clic = tap · arrastrar = swipe · escribe con el teclado</div>
      </div>

      <div className="dv-controls">
        <button onClick={() => sendKey('back')}>◁ Atrás</button>
        <button onClick={() => sendKey('home')}>◯ Inicio</button>
        <button onClick={() => sendKey('recents')}>▢ Recientes</button>
        <button onClick={() => sendKey('volup')}>Vol +</button>
        <button onClick={() => sendKey('voldown')}>Vol −</button>
        <button onClick={() => sendKey('power')}>⏻ Power</button>
      </div>

      <div className="dv-typebar">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendTyped()}
          placeholder="Escribir texto y Enter para enviar…"
        />
        <button onClick={sendTyped} disabled={!typed}>
          Enviar
        </button>
      </div>
    </div>
  );
}
