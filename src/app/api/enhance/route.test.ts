import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/lib/auth';
import { POST } from './route';

const SECRET = 'unit-test-secret';
const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.ADMIN_USER = 'tester';
  process.env.PROMO_BFF_URL = 'http://bff.local';
  process.env.PROMO_BFF_AUTH_BEARER = 'cabinet-dev';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

function authed(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/enhance', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `promo_session=${createSessionToken(SECRET)}`,
    },
    body: JSON.stringify(body),
  });
}

function bffResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('POST /api/enhance', () => {
  it('401 without a valid session cookie', async () => {
    const req = new NextRequest('http://localhost/api/enhance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: { title: 't' } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('400 when body is not JSON', async () => {
    const req = new NextRequest('http://localhost/api/enhance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `promo_session=${createSessionToken(SECRET)}`,
      },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_body');
  });

  it('400 when draft is missing/wrong type', async () => {
    expect((await POST(authed({}))).status).toBe(400);
    expect((await POST(authed({ draft: null }))).status).toBe(400);
    expect((await POST(authed({ draft: 'string' }))).status).toBe(400);
    expect((await POST(authed({ draft: [] }))).status).toBe(400);
  });

  it('forwards { advertiserId: adminUser, draft } to BFF and returns its envelope', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(bffResponse({
      status: 'ok',
      data: { suggestions: { title: 'X' }, cacheHit: false, model: 'm' },
    }));
    const res = await POST(authed({ draft: { title: 'летняя' } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.data.suggestions.title).toBe('X');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://bff.local/enhance-promo');
    const sentBody = JSON.parse(init.body as string) as { advertiserId: string; draft: unknown };
    expect(sentBody.advertiserId).toBe('tester'); // ADMIN_USER
    expect(sentBody.draft).toEqual({ title: 'летняя' });
  });

  it('503 ai_disabled when PROMO_BFF_URL is empty', async () => {
    process.env.PROMO_BFF_URL = '';
    const res = await POST(authed({ draft: { title: 't' } }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('ai_disabled');
  });

  it('502 ai_unavailable on network error from fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connection refused'));
    const res = await POST(authed({ draft: { title: 't' } }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('ai_unavailable');
  });

  it('502 ai_unavailable on BFF 500 / network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(bffResponse('boom', 500));
    const res = await POST(authed({ draft: { title: 't' } }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('ai_unavailable');
  });

  it('502 ai_unauthorized when BFF returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(bffResponse('nope', 401));
    const res = await POST(authed({ draft: { title: 't' } }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('ai_unauthorized');
  });
});
