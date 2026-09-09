import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/auth';

const bff = vi.hoisted(() => ({ listRecentCampaigns: vi.fn() }));
vi.mock('@/lib/bff-client', () => bff);

import { GET } from './route';

const SECRET = 'unit-test-secret';
const ORIGINAL = { ...process.env };

const request = (withSession = true) =>
  new NextRequest('http://localhost/api/campaigns', {
    headers: withSession ? { cookie: `promo_session=${createSessionToken(SECRET)}` } : {},
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  bff.listRecentCampaigns.mockReset();
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('GET /api/campaigns', () => {
  it('relays the BFF listing and status code as-is', async () => {
    const listing = { campaigns: [{ id: 5 }], channels: ['webPush'] };
    bff.listRecentCampaigns.mockResolvedValue({ status: 200, body: listing });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(listing);

    bff.listRecentCampaigns.mockResolvedValue({ status: 503, body: { error: 'campaigns_not_configured' } });
    const res503 = await GET(request());
    expect(res503.status).toBe(503);
    expect(await res503.json()).toEqual({ error: 'campaigns_not_configured' });
  });

  it('502 bff_unreachable when the BFF call throws; 401 without a session', async () => {
    bff.listRecentCampaigns.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET(request());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'bff_unreachable' });

    expect((await GET(request(false))).status).toBe(401);
    expect(bff.listRecentCampaigns).toHaveBeenCalledTimes(1);
  });
});
