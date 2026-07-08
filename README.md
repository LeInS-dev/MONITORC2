# ARGOS · Control Remoto de Dispositivos (v2)

Sistema para administrar y controlar remotamente una flota de **dispositivos Android
propios**, desde un dashboard web, con **enrolamiento consentido** (control total tras un
"Acepto" visible en cada equipo, con notificación de transparencia permanente).

Funciones: pantalla en vivo · control (tap/swipe/texto/teclas) · galería de fotos ·
explorador de archivos · auto-registro · streaming por WebSocket.

> ⚠️ **Uso legítimo.** Diseñado para tus propios equipos o equipos que administras con
> autorización. El enrolamiento es explícito y visible a propósito: la app muestra una
> pantalla de consentimiento y una notificación fija mientras está activa. No es una
> herramienta encubierta.

## Componentes

```
server/   Relay Express + ws (TS). Registro de dispositivos (token) + login de operador.
web/      Dashboard React (Vite): grid, pantalla en vivo, galería, archivos.
android/  App Kotlin: enrolamiento, servicio en 1er plano, captura, control, contenido.
```

## Puesta en marcha (servidor + dashboard)

```bash
cd server && npm install && cp .env.example .env   # edita ENROLL_TOKEN, OPERATOR_PASSWORD, JWT_SECRET
npm run dev                                         # relay en :4600

cd ../web && npm install && npm run build           # el server sirve web/dist
# (en dev, alternativamente: npm run dev → :5180 con proxy al relay)
```

Abre `http://<host>:4600`, entra con `OPERATOR_PASSWORD`.

### Prueba sin teléfono
Con el server corriendo: `cd server && npm run mock-device` → aparece un equipo simulado
"Mock Pixel 8" con pantalla, galería y archivos de prueba.

## App Android

Compila el APK en **Android Studio** (Giraffe+; incluye SDK y Gradle):

1. Abre la carpeta `android/` en Android Studio y deja que sincronice Gradle.
2. (Opcional) define la URL/token por defecto en `app/build.gradle.kts`
   (`DEFAULT_SERVER_URL`, `DEFAULT_ENROLL_TOKEN`) para builds por-flota.
3. Build → APK, instala en el equipo.
4. Abre la app → **pantalla de enrolamiento** → escribe `wss://tu-servidor:4600` y el
   token → **Acepto** → concede captura de pantalla, fotos y notificaciones → habilita el
   servicio de **Accesibilidad** cuando se abra Ajustes (necesario para el control).

A partir de ahí el equipo aparece solo en el dashboard y se reconecta tras reiniciar.

## Seguridad (equipos expuestos a internet)

- **Bindea el relay a Tailscale** (`BIND_HOST=100.x.x.x`), no a `0.0.0.0` público.
- `ENROLL_TOKEN`: sin token válido, un dispositivo no se registra.
- `OPERATOR_PASSWORD` + JWT: el dashboard requiere login.
- Usa **wss://** (TLS) — termina TLS en un proxy (Caddy/nginx) delante del relay.

## Fases de streaming

- **Fase A (activa y verificada):** frames **JPEG** sobre WebSocket (`ScreenCapturer`).
  Robusta; "en vivo" a pocos fps.
- **Fase B (incluida, requiere ajuste en dispositivo):** vídeo **H.264** de baja latencia
  (`H264Encoder` + decodificador WebCodecs en `useDeviceStream`). El pipeline está escrito;
  la conversión de formato NAL (Annex-B ↔ avcC) debe validarse en hardware real. El sistema
  cae a JPEG si H.264 no está disponible.

## Protocolo

Definido en `server/src/protocol.ts` (espejo en `web/src/protocol.ts` y
`android/.../net/Protocol.kt`). Control/metadatos = JSON; media = tramas binarias
`[type][idLen][deviceId][payload]`.
