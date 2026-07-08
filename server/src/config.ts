import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Carga mínima de .env (sin dependencias) — no sobrescribe variables ya presentes. */
function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, '..', '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(`[config] Falta la variable de entorno obligatoria: ${name}`);
    process.exit(1);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4600),
  bindHost: process.env.BIND_HOST ?? '0.0.0.0',
  enrollToken: required('ENROLL_TOKEN', 'dev-enroll-token'),
  operatorPassword: required('OPERATOR_PASSWORD', 'admin'),
  jwtSecret: process.env.JWT_SECRET ?? randomBytes(32).toString('hex'),
};

if (!process.env.JWT_SECRET) {
  console.warn('[config] JWT_SECRET no definido: usando uno efímero (las sesiones se invalidan al reiniciar).');
}
