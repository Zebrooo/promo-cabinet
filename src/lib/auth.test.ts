import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_COOKIE } from './auth';

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

  it('exposes a stable cookie name', () => {
    expect(SESSION_COOKIE).toBe('promo_session');
  });
});
