import { createHmac, timingSafeEqual } from 'node:crypto';

export { SESSION_COOKIE } from './session-cookie';

/**
 * Session lifetime. A token older than this is rejected even with a valid
 * signature, so a stolen cookie can't be used forever (revoke = rotate
 * SESSION_SECRET, or wait out the window). Keep in sync with the login cookie's
 * `maxAge`.
 */
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/** Signed session token: `admin.<issuedAtMs>.<hmac>`. Single shared admin identity. */
export function createSessionToken(secret: string, now: number = Date.now()): string {
  if (!secret) {
    // An empty key makes the HMAC trivially forgeable — never issue such a token.
    throw new Error('SESSION_SECRET is not configured — refusing to issue a forgeable session token');
  }
  const value = `admin.${now}`;
  return `${value}.${sign(value, secret)}`;
}

/**
 * Constant-time verification of a session token's signature AND age. Fails closed
 * when the secret is empty (empty-key HMAC is forgeable) or the token is older
 * than `maxAgeMs`.
 */
export function verifySessionToken(
  token: string | undefined,
  secret: string,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
  now: number = Date.now(),
): boolean {
  if (!token || !secret) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return false;
  const value = token.slice(0, lastDot);
  const provided = token.slice(lastDot + 1);
  const expected = sign(value, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  // Signature OK → enforce TTL. value === `admin.<issuedAtMs>`.
  const issuedAt = Number(value.slice(value.indexOf('.') + 1));
  if (!Number.isFinite(issuedAt)) return false;
  return now - issuedAt <= maxAgeMs;
}
