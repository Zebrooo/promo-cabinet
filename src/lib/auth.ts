import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'promo_session';

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/** Signed session token: `admin.<issuedAtMs>.<hmac>`. Single shared admin identity. */
export function createSessionToken(secret: string, now: number = Date.now()): string {
  const value = `admin.${now}`;
  return `${value}.${sign(value, secret)}`;
}

/** Constant-time verification of a session token's signature. */
export function verifySessionToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return false;
  const value = token.slice(0, lastDot);
  const provided = token.slice(lastDot + 1);
  const expected = sign(value, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
