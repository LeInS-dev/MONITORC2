import { useEffect, useMemo, useRef, useState } from 'react';
import type { OperatorClient } from '../api';
import type { DevicePublic, FileEntry } from '../protocol';
import { BlobCollector, bytesToObjectUrl } from '../blobs';

const ROOT = '/sdcard';

export function FileExplorer({
  client,
  device,
  collector,
}: {
  client: OperatorClient;
  device: DevicePublic;
  collector: BlobCollector;
}) {
  const [path, setPath] = useState(ROOT);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useMemo(() => `f-${device.deviceId}`, [device.deviceId]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const off = client.on('file:list', (rid, respPath, list) => {
      if (rid !== reqId) return;
      if (!mounted.current) return;
      setLoading(false);
      setPath(respPath);
      setEntries([...list].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)));
    });
    return () => {
      mounted.current = false;
      off();
    };
  }, [client, reqId]);

  useEffect(() => {
    setLoading(true);
    client.fileReq(device.deviceId, reqId, ROOT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.deviceId]);

  function navigate(p: string) {
    setLoading(true);
    client.fileReq(device.deviceId, reqId, p);
  }

  function up() {
    if (path === '/' || path === ROOT) return;
    const parent = path.replace(/\/[^/]+\/?$/, '') || '/';
    navigate(parent);
  }

  function download(entry: FileEntry) {
    collector.expect(`file:${entry.path}`, (bytes) => {
      const url = bytesToObjectUrl(bytes, 'application/octet-stream');
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
    client.fileDownload(device.deviceId, reqId, entry.path);
  }

  return (
    <div className="files">
      <div className="panel-head">Explorador de archivos</div>
      <div className="files-bar">
        <button onClick={up} disabled={path === ROOT}>
          ⬆ Subir
        </button>
        <button onClick={() => navigate(ROOT)}>⌂ {ROOT}</button>
        <span className="path mono">{path}</span>
      </div>
      <div className="file-list">
        {loading && <div className="muted">Cargando…</div>}
        {!loading &&
          entries.map((e) => (
            <div key={e.path} className="file-row">
              {e.isDir ? (
                <button className="file-name dir" onClick={() => navigate(e.path)}>
                  📁 {e.name}
                </button>
              ) : (
                <>
                  <span className="file-name">📄 {e.name}</span>
                  <span className="muted mono">{formatSize(e.sizeBytes)}</span>
                  <button className="mini" onClick={() => download(e)}>
                    Descargar
                  </button>
                </>
              )}
            </div>
          ))}
        {!loading && entries.length === 0 && <div className="muted">Carpeta vacía</div>}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
