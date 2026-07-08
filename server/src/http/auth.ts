import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/** Parser mínimo de la cabecera Cookie → mapa clave/valor. */
function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

const COOKIE = 'rc_token';
const MAX_AGE_S = 60 * 60 * 24; // 24h

export function signOperatorToken(): string {
  return jwt.sign({ role: 'operator' }, config.jwtSecret, { expiresIn: MAX_AGE_S });
}

export function verifyOperatorToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const p = jwt.verify(token, config.jwtSecret) as { role?: string };
    return p.role === 'operator';
  } catch {
    return false;
  }
}

/** Extrae el token del header Cookie (sirve para HTTP y para el upgrade de WS). */
export function tokenFromCookieHeader(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  return parseCookie(cookieHeader)[COOKIE];
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_S * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE);
}

export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  const token = tokenFromCookieHeader(req.headers.cookie);
  if (!verifyOperatorToken(token)) {
    res.status(401).json({ error: 'no autenticado' });
    return;
  }
  next();
}
