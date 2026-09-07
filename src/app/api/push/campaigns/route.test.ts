import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/auth';
import { proxyToPushAdmin } from '@/lib/push-admin';
import { GET, POST } from './route';

vi.mock('@/lib/push-admin', () => ({ proxyToPushAdmin: vi.fn() }));

const SECRET = 'push-route-test-secret';
const ORIGINAL = { ...process.env };
const proxy = vi.mocked(proxyToPushAdmin);

function request(method = 'GET', body?: unknown) {
  return new NextRequest('http://localhost/api/push/campaigns', {
    method,
    headers: {
      cookie: `promo_session=${createSessionToken(SECRET)}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  proxy.mockReset();
  proxy.mockResolvedValue(NextResponse.json({ campaigns: [] }));
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('/api/push/campaigns', () => {
  it('requires a real cabinet session', async () => {
    const response = await GET(new NextRequest('http://localhost/api/push/campaigns'));
    expect(response.status).toBe(401);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('loads history through the private BFF route', async () => {
    await GET(request());
    expect(proxy).toHaveBeenCalledWith(expect.any(NextRequest), '/push-admin/campaigns/list', { limit: 100 });
  });

  it('validates a draft before proxying it', async () => {
    const response = await POST(request('POST', {
      dedupKey: 'campaign-one',
      commandId: '6d01eb53-17e9-4405-a71c-c54af8fd5da1',
      title: 'Заголовок',
      body: 'Текст',
      path: 'https://evil.example',
      audienceMode: 'marketing_opt_in',
      maxRecipients: 20000,
    }));
    expect(response.status).toBe(400);
    expect(proxy).not.toHaveBeenCalled();
  });

  it('proxies a valid draft', async () => {
    const body = {
      dedupKey: 'campaign-one',
      commandId: '6d01eb53-17e9-4405-a71c-c54af8fd5da1',
      title: 'Заголовок',
      body: 'Текст',
      path: '/zapros',
      audienceMode: 'marketing_opt_in',
      scheduledAt: null,
      maxRecipients: 20000,
    };
    await POST(request('POST', body));
    expect(proxy).toHaveBeenCalledWith(expect.any(NextRequest), '/push-admin/campaigns/upsert', body);
  });
});
