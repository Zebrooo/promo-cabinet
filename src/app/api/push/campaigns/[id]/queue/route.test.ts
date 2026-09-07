import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/auth';
import { proxyToPushAdmin } from '@/lib/push-admin';
import { POST } from './route';

vi.mock('@/lib/push-admin', () => ({ proxyToPushAdmin: vi.fn() }));

const SECRET = 'push-queue-test-secret';
const ORIGINAL = { ...process.env };
const ID = '1425fbaa-d27b-42bd-a823-a18f4e2f9d49';
const COMMAND = '6d01eb53-17e9-4405-a71c-c54af8fd5da1';
const HASH = 'a'.repeat(64);
const proxy = vi.mocked(proxyToPushAdmin);

function request(password: string, origin = 'http://localhost') {
  return new NextRequest(`http://localhost/api/push/campaigns/${ID}/queue`, {
    method: 'POST',
    headers: {
      cookie: `promo_session=${createSessionToken(SECRET)}`,
      'content-type': 'application/json',
      origin,
      'sec-fetch-site': origin === 'http://localhost' ? 'same-origin' : 'cross-site',
    },
    body: JSON.stringify({
      expectedRevision: 3,
      commandId: COMMAND,
      expectedEligibleUsers: 15826,
      maxRecipients: 20000,
      expectedAudienceDigest: HASH,
      expectedPayloadHash: HASH,
      confirmation: '15826',
      password,
    }),
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.ADMIN_PASSWORD = 'correct horse';
  proxy.mockReset();
  proxy.mockResolvedValue(NextResponse.json({ campaign: { id: ID } }, { status: 202 }));
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('POST /api/push/campaigns/:id/queue', () => {
  it('re-authenticates the irreversible launch', async () => {
    const response = await POST(request('wrong'), { params: { id: ID } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'reauth_failed' });
    expect(proxy).not.toHaveBeenCalled();
  });

  it('rejects cross-site mutation requests', async () => {
    const response = await POST(request('correct horse', 'https://evil.example'), { params: { id: ID } });
    expect(response.status).toBe(403);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('passes hashes, count, revision and command id but never the password to BFF', async () => {
    const req = request('correct horse');
    const response = await POST(req, { params: { id: ID } });
    expect(response.status).toBe(202);
    expect(proxy).toHaveBeenCalledWith(req, '/push-admin/campaigns/queue', {
      id: ID,
      expectedRevision: 3,
      commandId: COMMAND,
      expectedEligibleUsers: 15826,
      maxRecipients: 20000,
      expectedAudienceDigest: HASH,
      expectedPayloadHash: HASH,
      confirmation: '15826',
    });
  });
});
