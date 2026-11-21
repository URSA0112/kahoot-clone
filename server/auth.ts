import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Minimal admin auth for the analytics dashboard.
 * - ADMIN_PASSWORD env var (required in production; "admin" fallback only for local dev).
 * - Login returns a signed token (HMAC-SHA256, 12h expiry) sent as "Authorization: Bearer <token>".
 * Knowing a game PIN gives no access to analytics.
 */
const SECRET = process.env.ADMIN_SECRET || randomBytes(32).toString('hex');
const PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');
const TTL_MS = 12 * 60 * 60 * 1000;

if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    process.env.NODE_ENV === 'production'
      ? 'ADMIN_PASSWORD is not set: admin dashboard login is disabled.'
      : 'ADMIN_PASSWORD not set: using dev password "admin".',
  );
}

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url');

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const attempts = new Map<string, { n: number; until: number }>();

export function login(req: Request, res: Response) {
  const ip = req.ip ?? 'x';
  const a = attempts.get(ip);
  if (a && a.until > Date.now() && a.n >= 5) return res.status(429).json({ error: 'Хэт олон оролдлого. 1 минутын дараа дахин оролдоно уу.' });
  const password = String(req.body?.password ?? '');
  if (!PASSWORD || !safeEqual(password, PASSWORD)) {
    attempts.set(ip, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 60_000 });
    return res.status(401).json({ error: 'Нууц үг буруу байна' });
  }
  attempts.delete(ip);
  const payload = String(Date.now() + TTL_MS);
  res.json({ token: `${payload}.${sign(payload)}` });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : String(req.query.token ?? '');
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload)) || Number(payload) < Date.now())
    return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  next();
}
