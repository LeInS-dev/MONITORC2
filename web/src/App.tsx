import { useEffect, useRef, useState } from 'react';
import { OperatorClient, checkAuth, logout } from './api';
import { BlobCollector } from './blobs';
import type { DevicePublic } from './protocol';
import { Login } from './components/Login';
import { DeviceGrid } from './components/DeviceGrid';
import { DeviceView } from './components/DeviceView';
import { Gallery } from './components/Gallery';
import { FileExplorer } from './components/FileExplorer';

type Tab = 'screen' | 'gallery' | 'files';

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<DevicePublic[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('screen');
  const [connected, setConnected] = useState(false);

  const clientRef = useRef<OperatorClient | null>(null);
  const collectorRef = useRef<BlobCollector | null>(null);
  if (!clientRef.current) {
    clientRef.current = new OperatorClient();
    collectorRef.current = new BlobCollector(clientRef.current);
  }
  const client = clientRef.current;
  const collector = collectorRef.current!;

  useEffect(() => {
    checkAuth().then(setAuthed);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const offs = [
      client.on('open', () => setConnected(true)),
      client.on('close', () => setConnected(false)),
      client.on('devices', (list) => setDevices(list)),
      client.on('device:added', (d) => setDevices((prev) => [...prev.filter((x) => x.deviceId !== d.deviceId), d])),
      client.on('device:removed', (id) => {
        setDevices((prev) => prev.filter((x) => x.deviceId !== id));
        setSelected((cur) => (cur === id ? null : cur));
      }),
      client.on('device:status', (id, battery, charging) =>
        setDevices((prev) => prev.map((d) => (d.deviceId === id ? { ...d, battery, charging } : d))),
      ),
    ];
    client.connect();
    return () => {
      offs.forEach((off) => off());
      client.disconnect();
    };
  }, [authed, client]);

  if (authed === null) return <div className="loading">Cargando…</div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  const selectedDevice = devices.find((d) => d.deviceId === selected) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>ARGOS · Control Remoto</h1>
        <div className="header-right">
          <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'conectado' : 'reconectando…'}</span>
          <button
            className="mini"
            onClick={async () => {
              await logout();
              setAuthed(false);
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <DeviceGrid devices={devices} selected={selected} onSelect={setSelected} />
        </aside>

        <main className="main">
          {!selectedDevice && <div className="empty muted">Selecciona un equipo de la izquierda.</div>}
          {selectedDevice && (
            <>
              <nav className="tabs">
                <button className={tab === 'screen' ? 'active' : ''} onClick={() => setTab('screen')}>
                  🖥️ Pantalla
                </button>
                <button className={tab === 'gallery' ? 'active' : ''} onClick={() => setTab('gallery')}>
                  🖼️ Galería
                </button>
                <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
                  📂 Archivos
                </button>
              </nav>
              <div className="tab-content">
                {tab === 'screen' && <DeviceView client={client} device={selectedDevice} />}
                {tab === 'gallery' && <Gallery client={client} device={selectedDevice} collector={collector} />}
                {tab === 'files' && <FileExplorer client={client} device={selectedDevice} collector={collector} />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
