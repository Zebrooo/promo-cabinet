import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env.ADMIN_USER = 'admin';
  process.env.ADMIN_PASSWORD = 'secret';
  process.env.SESSION_SECRET = 'unit-test-secret';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const loginReq = (body: unknown) =>
  new NextRequest('http://localhost/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
});
