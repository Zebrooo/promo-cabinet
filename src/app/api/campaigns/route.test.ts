import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/auth';

const bff = vi.hoisted(() => ({
  listCampaignsForModeration: vi.fn(),
  decideCampaign: vi.fn(),
}));
vi.mock('@/lib/bff-client', () => bff);

import { GET } from './route';
import { POST as DECIDE } from './decide/route';

const SECRET = 'unit-test-secret';
const ORIGINAL = { ...process.env };

const authed = (url: string, init: { method?: string; body?: unknown } = {}, withSession = true) =>
  new NextRequest(`http://localhost${url}`, {
    method: init.method ?? 'GET',
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    headers: {
      'content-type': 'application/json',
      ...(withSession ? { cookie: `promo_session=${createSessionToken(SECRET)}` } : {}),
    },
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.ADMIN_USER = 'nika';
  bff.listCampaignsForModeration.mockReset();
  bff.decideCampaign.mockReset();
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('GET /api/campaigns', () => {
  it('relays the BFF listing and status code as-is', async () => {
    const listing = { pending: [{ id: 5 }], recent: [], channels: ['webPush'] };
    bff.listCampaignsForModeration.mockResolvedValue({ status: 200, body: listing });
    const res = await GET(authed('/api/campaigns'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(listing);

    bff.listCampaignsForModeration.mockResolvedValue({ status: 503, body: { error: 'moderation_not_configured' } });
    const res503 = await GET(authed('/api/campaigns'));
    expect(res503.status).toBe(503);
    expect(await res503.json()).toEqual({ error: 'moderation_not_configured' });
  });

  it('502 bff_unreachable when the BFF call throws; 401 without a session', async () => {
    bff.listCampaignsForModeration.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET(authed('/api/campaigns'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'bff_unreachable' });

    expect((await GET(authed('/api/campaigns', {}, false))).status).toBe(401);
    expect(bff.listCampaignsForModeration).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/campaigns/decide', () => {
  it('validates the body and forwards the decision with the cabinet admin as actor', async () => {
    bff.decideCampaign.mockResolvedValue({ status: 200, body: { ok: true, campaign: { id: 7 } } });
    const res = await DECIDE(authed('/api/campaigns/decide', { method: 'POST', body: { campaignId: 7, decision: 'rejected', reason: '  нет цены ' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, campaign: { id: 7 } });
    expect(bff.decideCampaign).toHaveBeenCalledWith({ campaignId: 7, decision: 'rejected', reason: 'нет цены', actor: 'nika' });

    bff.decideCampaign.mockResolvedValue({ status: 200, body: { ok: true, campaign: { id: 8 } } });
    await DECIDE(authed('/api/campaigns/decide', { method: 'POST', body: { campaignId: 8, decision: 'approved' } }));
    expect(bff.decideCampaign).toHaveBeenLastCalledWith({ campaignId: 8, decision: 'approved', actor: 'nika' });
  });

  it('400 on a bad body, relays 404 from the BFF, 401 without a session', async () => {
    for (const body of [{}, { campaignId: '7', decision: 'approved' }, { campaignId: 7, decision: 'later' }, { campaignId: -1, decision: 'approved' }]) {
      expect((await DECIDE(authed('/api/campaigns/decide', { method: 'POST', body }))).status).toBe(400);
    }
    expect(bff.decideCampaign).not.toHaveBeenCalled();

    bff.decideCampaign.mockResolvedValue({ status: 404, body: { error: 'not_found' } });
    const res = await DECIDE(authed('/api/campaigns/decide', { method: 'POST', body: { campaignId: 99, decision: 'approved' } }));
    expect(res.status).toBe(404);

    expect((await DECIDE(authed('/api/campaigns/decide', { method: 'POST', body: { campaignId: 1, decision: 'approved' } }, false))).status).toBe(401);
  });
});
