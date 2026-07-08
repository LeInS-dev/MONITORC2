#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ARGOS Remote Control v2 — lanzamiento en un comando.
#
#   ./run.sh
#
# Qué hace, de forma idempotente:
#   1. Genera server/.env con secretos fuertes SOLO si no existe (y te muestra la
#      OPERATOR_PASSWORD una vez).
#   2. Instala dependencias de server/ y web/ (npm install).
#   3. Construye el dashboard (web/dist), que el relay sirve en el mismo origen.
#   4. Arranca el relay (server) en primer plano.
#
# Variables opcionales:
#   PORT / BIND_HOST   sobrescriben el .env al generarlo (por defecto 4600 / 0.0.0.0).
#   SKIP_INSTALL=1     salta npm install (útil en re-arranques).
#   SKIP_BUILD=1       salta el build del dashboard.
#
# NOTA: para exponerlo a dispositivos reales, ponlo detrás de TLS (wss://) y
# bindea BIND_HOST a tu IP de Tailscale, no a 0.0.0.0. Ver README.md § Seguridad.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

command -v node >/dev/null 2>&1 || { echo "✗ Falta Node.js (>=18)."; exit 1; }

ENV_FILE="server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "→ Generando $ENV_FILE con secretos aleatorios…"
  ENROLL_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  OPERATOR_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  cat > "$ENV_FILE" <<EOF
# Generado por run.sh. NO commitear (está en .gitignore). Guarda estos valores.
PORT=${PORT:-4600}
BIND_HOST=${BIND_HOST:-0.0.0.0}
ENROLL_TOKEN=${ENROLL_TOKEN}
OPERATOR_PASSWORD=${OPERATOR_PASSWORD}
JWT_SECRET=${JWT_SECRET}
EOF
  echo "──────────────────────────────────────────────────────────────"
  echo "  OPERATOR_PASSWORD (login del dashboard): ${OPERATOR_PASSWORD}"
  echo "  ENROLL_TOKEN (para enrolar dispositivos): ${ENROLL_TOKEN}"
  echo "  → Guárdalos ahora; el .env no se vuelve a mostrar."
  echo "──────────────────────────────────────────────────────────────"
else
  echo "→ Reusando $ENV_FILE existente."
fi

if [[ "${SKIP_INSTALL:-}" != "1" ]]; then
  echo "→ Instalando dependencias (server/ y web/)…"
  ( cd server && npm install --no-fund --no-audit )
  ( cd web && npm install --no-fund --no-audit )
fi

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "→ Construyendo el dashboard (web/dist)…"
  ( cd web && npm run build )
fi

PORT_SHOW="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"
echo "→ Arrancando el relay en http://localhost:${PORT_SHOW:-4600}  (Ctrl-C para parar)"
echo "  Prueba sin teléfono, en otra terminal:  cd server && npm run mock-device"
exec bash -c 'cd server && npm start'
