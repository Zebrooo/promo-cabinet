import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/auth';

const bff = vi.hoisted(() => ({
  listPushCampaigns: vi.fn(),
  savePushCampaign: vi.fn(),
  getPushCampaign: vi.fn(),
  deletePushCampaign: vi.fn(),
  sendPushCampaign: vi.fn(),
}));
vi.mock('@/lib/bff-client', () => bff);

import { GET, POST } from './route';
import { DELETE, GET as GET_ONE } from './[id]/route';
import { POST as SEND } from './[id]/send/route';

const SECRET = 'unit-test-secret';
const ORIGINAL = { ...process.env };

const request = (init: { method?: string; body?: unknown; session?: boolean } = {}) =>
  new NextRequest('http://localhost/api/push-campaigns', {
    method: init.method ?? 'GET',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      'content-type': 'application/json',
      ...(init.session === false ? {} : { cookie: `promo_session=${createSessionToken(SECRET)}` }),
    },
  });

const draft = { title: 'Скидки', body: 'Только сегодня', url: '/sale', targeting: { minAge: 18 }, audience: 'all' };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  for (const fn of Object.values(bff)) fn.mockReset();
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('GET /api/push-campaigns', () => {
  it('relays the BFF listing and status code as-is; 401 without a session', async () => {
    const listing = { campaigns: [{ id: 'push-1' }], broadcastConfigured: false };
    bff.listPushCampaigns.mockResolvedValue({ status: 200, body: listing });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(listing);
    expect((await GET(request({ session: false }))).status).toBe(401);
    expect(bff.listPushCampaigns).toHaveBeenCalledTimes(1);
  });

  it('502 bff_unreachable when the BFF call throws', async () => {
    bff.listPushCampaigns.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET(request());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'bff_unreachable' });
  });
});

describe('POST /api/push-campaigns', () => {
  it('validates the draft locally and relays the saved campaign', async () => {
    bff.savePushCampaign.mockResolvedValue({ status: 201, body: { campaign: { ...draft, id: 'push-1', status: 'draft' } } });
    const res = await POST(request({ method: 'POST', body: draft }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ campaign: { id: 'push-1' } });
    expect(bff.savePushCampaign).toHaveBeenCalledWith(expect.objectContaining({ title: 'Скидки', url: '/sale', targeting: { minAge: 18 } }));
  });

  it('400 invalid_push_campaign with per-field issues, without touching the BFF', async () => {
    const res = await POST(request({ method: 'POST', body: { ...draft, title: '', url: 'javascript:alert(1)' } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_push_campaign');
    expect(body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(['title', 'url']));
    expect(bff.savePushCampaign).not.toHaveBeenCalled();
  });

  it('relays 409 already_sent from the BFF', async () => {
    bff.savePushCampaign.mockResolvedValue({ status: 409, body: { error: 'already_sent' } });
    const res = await POST(request({ method: 'POST', body: { ...draft, id: 'push-1' } }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_sent' });
  });
});

describe('/api/push-campaigns/[id]', () => {
  it('GET/DELETE relay the BFF; malformed ids are 404 without a BFF call', async () => {
    bff.getPushCampaign.mockResolvedValue({ status: 200, body: { campaign: { id: 'push-1' } } });
    expect((await GET_ONE(request(), { params: { id: 'push-1' } })).status).toBe(200);
    bff.deletePushCampaign.mockResolvedValue({ status: 404, body: { error: 'not_found' } });
    expect((await DELETE(request({ method: 'DELETE' }), { params: { id: 'push-1' } })).status).toBe(404);
    expect((await GET_ONE(request(), { params: { id: 'bad/id' } })).status).toBe(404);
    expect(bff.getPushCampaign).toHaveBeenCalledTimes(1);
  });

  it('send relays 200 / 503 push_not_configured / 502 push_broadcast_failed', async () => {
    bff.sendPushCampaign.mockResolvedValue({ status: 200, body: { campaign: { id: 'push-1', status: 'sent' } } });
    const ok = await SEND(request({ method: 'POST' }), { params: { id: 'push-1' } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ campaign: { status: 'sent' } });

    bff.sendPushCampaign.mockResolvedValue({ status: 503, body: { error: 'push_not_configured' } });
    expect((await SEND(request({ method: 'POST' }), { params: { id: 'push-1' } })).status).toBe(503);

    bff.sendPushCampaign.mockRejectedValue(new Error('timeout'));
    const down = await SEND(request({ method: 'POST' }), { params: { id: 'push-1' } });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: 'bff_unreachable' });

    expect((await SEND(request({ method: 'POST', session: false }), { params: { id: 'push-1' } })).status).toBe(401);
  });
});
