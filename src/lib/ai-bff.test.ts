import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiBffError, callEnhanceBff } from './ai-bff';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.PROMO_BFF_URL = 'http://bff.local';
  process.env.PROMO_BFF_AUTH_BEARER = 'cabinet-dev';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

function okBff(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('callEnhanceBff', () => {
  it('POSTs to /enhance-promo with bearer + JSON body and returns the envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okBff({
      status: 'ok',
      data: { suggestions: { title: 'X' }, cacheHit: false, model: 'm' },
    }));
    const r = await callEnhanceBff(
      { advertiserId: 'adv1', draft: { title: 't' } },
      { fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://bff.local/enhance-promo');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer cabinet-dev');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ advertiserId: 'adv1', draft: { title: 't' } });
    expect(r.status).toBe('ok');
    expect(r.data?.suggestions.title).toBe('X');
  });

  it('omits Authorization header when no bearer is configured', async () => {
    process.env.PROMO_BFF_AUTH_BEARER = '';
    const fetchImpl = vi.fn().mockResolvedValue(okBff({ status: 'ok' }));
    await callEnhanceBff({ advertiserId: 'a', draft: {} }, { fetchImpl });
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws bff_disabled when PROMO_BFF_URL is empty', async () => {
    process.env.PROMO_BFF_URL = '';
    await expect(callEnhanceBff({ advertiserId: 'a', draft: { title: 't' } })).rejects.toMatchObject({
      name: 'AiBffError',
      code: 'bff_disabled',
    });
  });

  it('strips a trailing slash from PROMO_BFF_URL', async () => {
    process.env.PROMO_BFF_URL = 'http://bff.local/';
    const fetchImpl = vi.fn().mockResolvedValue(okBff({ status: 'ok' }));
    await callEnhanceBff({ advertiserId: 'a', draft: { title: 't' } }, { fetchImpl });
    expect((fetchImpl.mock.calls[0][0] as string)).toBe('http://bff.local/enhance-promo');
  });

  it('throws unauthorized on a 401 from BFF', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(callEnhanceBff({ advertiserId: 'a', draft: { title: 't' } }, { fetchImpl })).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('throws bff_error on any other non-2xx, with status in message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 500, statusText: 'Internal Server Error' }));
    const err = await callEnhanceBff({ advertiserId: 'a', draft: { title: 't' } }, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(AiBffError);
    expect((err as AiBffError).code).toBe('bff_error');
    expect((err as Error).message).toMatch(/500/);
  });

  it('aborts and throws timeout past timeoutMs', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      }),
    );
    await expect(callEnhanceBff(
      { advertiserId: 'a', draft: { title: 't' } },
      { fetchImpl, timeoutMs: 10 },
    )).rejects.toMatchObject({ code: 'timeout' });
  });

  it('wraps network errors with code:network', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('connection refused'));
    await expect(callEnhanceBff({ advertiserId: 'a', draft: { title: 't' } }, { fetchImpl })).rejects.toMatchObject({
      code: 'network',
    });
  });
});
