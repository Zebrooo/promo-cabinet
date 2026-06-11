import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_COOKIE, SESSION_MAX_AGE_MS } from './auth';

const secret = 'test-secret-please-change';

describe('session tokens', () => {
  it('verifies a token it just created', () => {
    const token = createSessionToken(secret);
    expect(verifySessionToken(token, secret)).toBe(true);
  });

  it('rejects an undefined token', () => {
    expect(verifySessionToken(undefined, secret)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken('other-secret');
    expect(verifySessionToken(token, secret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken(secret);
    const tampered = token.replace(/^admin\./, 'attacker.');
    expect(verifySessionToken(tampered, secret)).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(verifySessionToken('garbage', secret)).toBe(false);
  });

  it('accepts a token within the max-age window', () => {
    const token = createSessionToken(secret, Date.now() - 1000);
    expect(verifySessionToken(token, secret)).toBe(true);
  });

  it('rejects a token older than the max age (even with a valid signature)', () => {
    const token = createSessionToken(secret, Date.now() - (SESSION_MAX_AGE_MS + 1000));
    expect(verifySessionToken(token, secret)).toBe(false);
  });

  it('fails closed on an empty secret', () => {
    const token = createSessionToken(secret);
    expect(verifySessionToken(token, '')).toBe(false);
    expect(() => createSessionToken('')).toThrow();
  });

  it('exposes a stable cookie name', () => {
    expect(SESSION_COOKIE).toBe('promo_session');
  });
});
