import { useEffect, useRef, useState } from 'react';
import type { OperatorClient } from '../api';
import { BIN } from '../protocol';

/**
 * Suscribe a un dispositivo y pinta su pantalla en el canvas dado.
 * - JPEG (Fase A): decodifica cada frame con createImageBitmap.
 * - H.264 (Fase B): usa WebCodecs VideoDecoder si está disponible.
 * Devuelve fps observados.
 */
export function useDeviceStream(
  client: OperatorClient,
  deviceId: string | null,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  active: boolean,
): { fps: number } {
  const [fps, setFps] = useState(0);
  const decoding = useRef(false);
  const frameCount = useRef(0);

  useEffect(() => {
    if (!deviceId || !active) return;

    let decoder: VideoDecoder | null = null;
    let disposed = false;

    const draw = (bitmap: ImageBitmap | VideoFrame, w: number, h: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
      frameCount.current++;
    };

    const ensureDecoder = () => {
      if (decoder || typeof VideoDecoder === 'undefined') return decoder;
      decoder = new VideoDecoder({
        output: (frame) => {
          draw(frame, frame.displayWidth, frame.displayHeight);
          frame.close();
        },
        error: (e) => console.warn('[stream] decoder error', e.message),
      });
      return decoder;
    };

    const offVideo = client.on('video', async (id, type, payload) => {
      if (id !== deviceId) return;
      // Copia estable del buffer (el subarray apunta al buffer del WS).
      const bytes = payload.slice();

      if (type === BIN.JPEG) {
        if (decoding.current) return; // drop para no acumular latencia
        decoding.current = true;
        try {
          const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
          if (!disposed) draw(bmp, bmp.width, bmp.height);
          bmp.close();
        } catch {
          /* frame corrupto → ignorar */
        } finally {
          decoding.current = false;
        }
        return;
      }

      // H.264 (Fase B)
      const dec = ensureDecoder();
      if (!dec) return;
      try {
        if (type === BIN.H264_CONFIG) {
          dec.configure({ codec: 'avc1.42E01E', description: bytes });
          return;
        }
        if (dec.state !== 'configured') return;
        dec.decode(
          new EncodedVideoChunk({
            type: type === BIN.H264_KEY ? 'key' : 'delta',
            timestamp: performance.now() * 1000,
            data: bytes,
          }),
        );
      } catch (e) {
        console.warn('[stream] decode fallo', (e as Error).message);
      }
    });

    client.subscribe(deviceId, 'full');
    const fpsTimer = window.setInterval(() => {
      setFps(frameCount.current);
      frameCount.current = 0;
    }, 1000);

    return () => {
      disposed = true;
      offVideo();
      client.unsubscribe(deviceId);
      window.clearInterval(fpsTimer);
      try {
        decoder?.close();
      } catch {
        /* noop */
      }
    };
  }, [client, deviceId, active, canvasRef]);

  return { fps };
}
