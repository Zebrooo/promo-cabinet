import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/auth';

vi.mock('@/lib/bff-client', () => ({ aaAdminPost: vi.fn(async () => ({ status: 200, body: { ok: true } })) }));
import { aaAdminPost } from '@/lib/bff-client';
import { POST } from '@/app/api/aa/canary/pct/route';

const SECRET = 'unit-test-secret';
const ORIGINAL = { ...process.env };
beforeEach(() => { process.env.SESSION_SECRET = SECRET; });
afterEach(() => { vi.clearAllMocks(); process.env = { ...ORIGINAL }; });

function req(body: unknown, mode?: 'prod' | 'test') {
  const cookie = `promo_session=${createSessionToken(SECRET)}${mode ? `; cab_env=${mode}` : ''}`;
  return new NextRequest('http://localhost/api/aa/canary/pct', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('/api/aa/* takes env from the cabinet mode cookie, not from the body', () => {
  it('ignores env in the body and forwards the cookie mode', async () => {
    const res = await POST(req({ env: 'prod', pct: 10 }, 'test'));
    expect(res.status).toBe(200);
    expect(aaAdminPost).toHaveBeenCalledWith('/aa-admin/canary/pct', { pct: 10, env: 'test' });
  });

  it('defaults to prod when the mode cookie is missing', async () => {
    await POST(req({ pct: 5 }));
    expect(aaAdminPost).toHaveBeenCalledWith('/aa-admin/canary/pct', { pct: 5, env: 'prod' });
  });
});
