import type { DevicePublic } from '../protocol';

export function DeviceGrid({
  devices,
  selected,
  onSelect,
}: {
  devices: DevicePublic[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="device-grid">
      <div className="panel-head">Equipos ({devices.length})</div>
      {devices.length === 0 && <div className="muted pad">Ningún equipo conectado.</div>}
      {devices.map((d) => (
        <button
          key={d.deviceId}
          className={`device-card ${selected === d.deviceId ? 'sel' : ''}`}
          onClick={() => onSelect(d.deviceId)}
        >
          <div className="dc-model">{d.model}</div>
          <div className="dc-meta mono">
            Android {d.androidVersion} · {d.width}×{d.height}
          </div>
          <div className="dc-meta">
            {typeof d.battery === 'number' ? `🔋 ${d.battery}%${d.charging ? ' ⚡' : ''}` : ''}
          </div>
        </button>
      ))}
    </div>
  );
}
