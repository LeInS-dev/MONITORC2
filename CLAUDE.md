# CLAUDE.md — ARGOS Remote Control v2 (MONITORC2)

Guía operativa para Claude Code en este repo. Guía viva, no changelog: el historial vive
en `git log`; el detalle de cada subsistema, en el código; aquí solo el estado y lo abierto.

> **Producto:** sistema de control remoto **consentido** de dispositivos Android **propios**.
> Enrolamiento explícito (pantalla "Acepto" + notificación fija permanente). NO es una
> herramienta encubierta — el consentimiento visible es un requisito de diseño, no un extra.

---

## 🏗️ Arquitectura

```
App Android (Kotlin)              Servidor relay (TS)            Dashboard (React)
─ Enrolamiento + consent          ─ ws hub (token-gated)         ─ Grid de equipos
─ Foreground service + notif      ─ registro de dispositivos     ─ Pantalla en vivo + control
─ MediaProjection → vídeo   ──WS──► relay pantalla/eventos ──WS──► Galería
─ AccessibilityService → input ◄──WS── comandos de control  ◄──── Explorador de archivos
─ MediaStore/File → fotos/archivos
```

- **server/** — Express + `ws`. Relay puro: los equipos se registran (WS `/ws/device`,
  gated por `ENROLL_TOKEN`); los operadores (WS `/ws/operator`, JWT) se suscriben y el relay
  reenvía frames en un sentido y comandos en el otro. Protocolo en `server/src/protocol.ts`.
- **web/** — React + Vite. `App.tsx` (login→dashboard), `api.ts` (REST+WS), componentes
  `DeviceGrid`/`DeviceView`/`Gallery`/`FileExplorer`, `hooks/useDeviceStream.ts`.
- **android/** — Kotlin, un módulo Gradle. Ver `README.md` para compilar en Android Studio.

**Protocolo WS** (3 copias en sync — cambiar las 3 a la vez):
`server/src/protocol.ts` · `web/src/protocol.ts` · `android/.../net/Protocol.kt`.
Control/metadatos = JSON; media = binario `[type][idLen][deviceId][payload]`;
blobs (thumbnails/fotos/archivos) = `type=10` + `[reqIdLen][reqId][chunkIndex u32][last u8][bytes]`.

---

## ✅ Estado (verificado)

- **server/ + web/**: `npx tsc` limpio; build de web OK. Relay probado headless **y** en
  navegador real (Chromium/Playwright): login, auto-registro, pantalla en vivo (JPEG, fps>0),
  control (tap/swipe/texto/teclas), galería (thumbnails decodificados), explorador de archivos.
- **android/**: fuente completa y coherente. **No compilada aquí** (sin Android SDK) →
  compilar en Android Studio. Ruta de streaming verificada = **JPEG (Fase A)**.
- Prueba sin teléfono: `cd server && npm run mock-device` (equipo simulado "Mock Pixel 8").

---

## 📋 Pendientes (roadmap)

Orden sugerido:

1. **Compilar y probar el APK en un dispositivo real** (Android Studio) — enrolamiento →
   permisos (MediaProjection + Accesibilidad + fotos) → confirmar que aparece en el dashboard
   y responde a control/galería/archivos. Es la validación que falta end-to-end.
2. **H.264 (Fase B) — ajuste en hardware.** `android/.../capture/H264Encoder.kt` emite NAL de
   `MediaCodec` (Annex-B con SPS/PPS en el flag CODEC_CONFIG). El decodificador del navegador
   (`web/src/hooks/useDeviceStream.ts`) usa WebCodecs `VideoDecoder` con `description` (formato
   avcC). **Falta conciliar Annex-B ↔ avcC**: o convertir SPS/PPS a avcC en el server/cliente,
   o configurar el `VideoDecoder` en modo Annex-B. Hoy el sistema usa JPEG por defecto; el
   servicio (`ManagerForegroundService.startStreaming`) arranca `ScreenCapturer` (JPEG) —
   añadir selección de modo H.264 cuando el pipeline esté validado.
3. **Explorador de archivos: subida (upload).** Hoy solo hay descarga. Falta: comando WS
   `file:upload` (operador→device con bytes), handler en `ManagerForegroundService`, escritura
   en `DeviceFileProvider`, y UI de subir en `web/src/components/FileExplorer.tsx`.
4. **Thumbnails en vivo en el grid.** `DeviceGrid` muestra tarjetas estáticas; el vídeo solo
   corre en `DeviceView`. Opcional: modo `subscribe` con `mode:'thumb'` (baja resolución/fps)
   para miniaturas en vivo de varios equipos (el protocolo ya distingue thumb/full).
5. **Seguridad de despliegue.** Terminar **TLS (wss://)** con Caddy/nginx delante del relay;
   bindear `BIND_HOST` a la IP de **Tailscale**, no `0.0.0.0`. Generar `ENROLL_TOKEN`,
   `OPERATOR_PASSWORD`, `JWT_SECRET` largos. Ver `server/.env.example`.
6. **Persistencia opcional.** `registry.ts` es en memoria (se pierde al reiniciar el server);
   los equipos se re-registran solos al reconectar, pero si quieres historial/estado, persistir.

---

## ⚠️ Gotchas (aprendidos en el build)

- **Blobs y suscripción de vídeo.** Los blobs (`type=10`) se difunden a **todos** los
  operadores por `reqId`, NO solo a los suscritos a vídeo (`server/src/ws/hub.ts`). Si se
  gatean tras la suscripción, la galería/archivos se rompen al salir del tab de pantalla.
- **TS 5.7 typed arrays.** `new Blob([uint8])` falla el tipo (SharedArrayBuffer). Usar
  `new Blob([new Uint8Array(bytes)])` (copia respaldada por ArrayBuffer). Ver `web/src/blobs.ts`.
- **Coordenadas de control.** El vídeo puede ir a resolución reducida, pero las coords de
  tap/swipe van en **píxeles completos** del dispositivo (los reportados en `register`). El
  dashboard mapea viewport→resolución completa; no atar coords a la resolución del vídeo.
- **MediaProjection tras reboot.** El `BootReceiver` relanza el servicio y control/galería/
  archivos vuelven solos, pero la **captura de pantalla requiere re-conceder** el permiso al
  abrir la app (regla de Android; el consentimiento de MediaProjection no persiste).
- **Accesibilidad = control.** Sin el `AccessibilityService` habilitado en Ajustes, NO hay
  tap/swipe/texto (solo pantalla/galería/archivos). El enrolamiento abre Ajustes para activarlo.

---

## ⚙️ Comandos

```bash
# Servidor
cd server && npm install && cp .env.example .env   # editar tokens/password/secret
npm run dev            # relay :4600 (tsx watch)   · npm run typecheck
npm run mock-device    # equipo simulado (con el server corriendo)

# Dashboard
cd web && npm install
npm run dev            # :5180 con proxy al relay   · npm run build (el server sirve web/dist)
npm run typecheck

# Android → Android Studio (compileSdk 34, minSdk 26). Ver README.md.
```

Verificación en navegador (sin teléfono): server + `npm run mock-device` + abrir el dashboard,
login con `OPERATOR_PASSWORD` → aparece "Mock Pixel 8" con pantalla/galería/archivos.

---

## 🌍 Idioma

Comentarios, logs y textos de UI: **español**.
