import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { LOGIN_MAX_FAILS_PER_IP, resetLoginLimiterForTests } from '@/lib/login-limiter';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  resetLoginLimiterForTests();
  process.env.ADMIN_USER = 'admin';
  process.env.ADMIN_PASSWORD = 'secret';
  process.env.SESSION_SECRET = 'unit-test-secret';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const loginReq = (body: unknown, ip = '10.0.0.1') =>
  new NextRequest('http://localhost/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 172.18.0.1` },
    body: JSON.stringify(body),
  });

describe('POST /api/login', () => {
  it('sets a session cookie on correct credentials', async () => {
    const res = await POST(loginReq({ user: 'admin', password: 'secret' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/promo_session=/);
  });

  it('returns 401 on wrong credentials', async () => {
    const res = await POST(loginReq({ user: 'admin', password: 'nope' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 400 on a malformed body', async () => {
    const res = await POST(loginReq({ user: 'admin' }));
    expect(res.status).toBe(400);
  });

  it('locks an IP out with 429 after too many failures, even for the right password', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILS_PER_IP; i++) {
      expect((await POST(loginReq({ user: 'admin', password: `nope${i}` }))).status).toBe(401);
    }
    const blocked = await POST(loginReq({ user: 'admin', password: 'secret' }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(blocked.headers.get('set-cookie')).toBeNull();
    // другой IP не задет
    expect((await POST(loginReq({ user: 'admin', password: 'secret' }, '10.0.0.2'))).status).toBe(200);
  });

  it('a successful login clears the failure counter for that IP', async () => {
    for (let i = 0; i < LOGIN_MAX_FAILS_PER_IP - 1; i++) await POST(loginReq({ user: 'admin', password: 'nope' }));
    expect((await POST(loginReq({ user: 'admin', password: 'secret' }))).status).toBe(200);
    for (let i = 0; i < LOGIN_MAX_FAILS_PER_IP - 1; i++) await POST(loginReq({ user: 'admin', password: 'nope' }));
    expect((await POST(loginReq({ user: 'admin', password: 'secret' }))).status).toBe(200);
  });
});
