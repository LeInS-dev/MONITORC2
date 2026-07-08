import { useEffect, useMemo, useRef, useState } from 'react';
import type { OperatorClient } from '../api';
import type { DevicePublic, GalleryItem } from '../protocol';
import { BlobCollector, bytesToObjectUrl } from '../blobs';

export function Gallery({
  client,
  device,
  collector,
}: {
  client: OperatorClient;
  device: DevicePublic;
  collector: BlobCollector;
}) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [full, setFull] = useState<{ id: string; url: string } | null>(null);
  const reqId = useMemo(() => `g-${device.deviceId}`, [device.deviceId]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setItems([]);
    setThumbs({});
    const off = client.on('gallery:list', (rid, _total, list) => {
      if (rid !== reqId) return;
      setItems(list);
      for (const it of list) {
        collector.expect(`thumb:${it.id}`, (bytes) => {
          if (!mounted.current) return;
          setThumbs((t) => ({ ...t, [it.id]: bytesToObjectUrl(bytes, 'image/jpeg') }));
        });
      }
    });
    client.galleryReq(device.deviceId, reqId, 0, 200);
    return () => {
      mounted.current = false;
      off();
    };
  }, [client, device.deviceId, reqId, collector]);

  function openFull(it: GalleryItem) {
    collector.expect(`photo:${it.id}`, (bytes) => {
      if (mounted.current) setFull({ id: it.id, url: bytesToObjectUrl(bytes, 'image/jpeg') });
    });
    client.photoReq(device.deviceId, `p-${it.id}`, it.id);
  }

  return (
    <div className="gallery">
      <div className="panel-head">Galería · {items.length} fotos</div>
      <div className="thumb-grid">
        {items.map((it) => (
          <button key={it.id} className="thumb" onClick={() => openFull(it)} title={it.name}>
            {thumbs[it.id] ? (
              <img src={thumbs[it.id]} alt={it.name} />
            ) : (
              <div className="thumb-ph" />
            )}
          </button>
        ))}
        {items.length === 0 && <div className="muted">Sin fotos o cargando…</div>}
      </div>

      {full && (
        <div className="lightbox" onClick={() => setFull(null)}>
          <img src={full.url} alt="foto" />
          <a className="download-btn" href={full.url} download={`${full.id}.jpg`} onClick={(e) => e.stopPropagation()}>
            Descargar
          </a>
        </div>
      )}
    </div>
  );
}
