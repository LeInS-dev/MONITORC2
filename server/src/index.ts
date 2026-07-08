import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import {
  signOperatorToken,
  setAuthCookie,
  clearAuthCookie,
  requireOperator,
  tokenFromCookieHeader,
  verifyOperatorToken,
} from './http/auth.js';
import { registry } from './registry.js';
import { attachWebSockets } from './ws/hub.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, devices: registry.listDevices().length });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password !== config.operatorPassword) {
    res.status(401).json({ error: 'contraseña incorrecta' });
    return;
  }
  setAuthCookie(res, signOperatorToken());
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const ok = verifyOperatorToken(tokenFromCookieHeader(req.headers.cookie));
  res.json({ authenticated: ok });
});

app.get('/api/devices', requireOperator, (_req, res) => {
  res.json({ devices: registry.listDevices() });
});

// SPA estática (build de web/) si existe.
const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(resolve(webDist, 'index.html'));
  });
  console.log(`[http] sirviendo SPA desde ${webDist}`);
} else {
  console.log('[http] web/dist no encontrado — corre `npm run build` en web/ para servir el dashboard.');
}

const server = createServer(app);
attachWebSockets(server);

server.listen(config.port, config.bindHost, () => {
  console.log(`[server] escuchando en http://${config.bindHost}:${config.port}`);
  console.log('[server] WS dispositivos: /ws/device   ·   WS operadores: /ws/operator');
});
