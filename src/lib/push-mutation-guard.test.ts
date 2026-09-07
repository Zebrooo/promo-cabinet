import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isTrustedMutationOrigin } from './push-mutation-guard';

const originalPublicBase = process.env.PROMO_CABINET_PUBLIC_BASE;

function request(origin: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://0.0.0.0:3190/api/push/campaigns', {
    method: 'POST',
    headers: {
      origin,
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
  });
}

afterEach(() => {
  if (originalPublicBase === undefined) {
    delete process.env.PROMO_CABINET_PUBLIC_BASE;
  } else {
    process.env.PROMO_CABINET_PUBLIC_BASE = originalPublicBase;
  }
});

describe('push mutation origin guard', () => {
  it('accepts the real browser origin behind the trusted Traefik headers', () => {
    const req = request('https://admin.eremin.site', {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'admin.eremin.site',
    });

    expect(isTrustedMutationOrigin(req)).toBe(true);
  });

  it('rejects a foreign origin even when the request arrived through Traefik', () => {
    const req = request('https://evil.example', {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'admin.eremin.site',
    });

    expect(isTrustedMutationOrigin(req)).toBe(false);
  });

  it('accepts an explicitly configured public origin when proxy headers are absent', () => {
    process.env.PROMO_CABINET_PUBLIC_BASE = 'https://admin.eremin.site/';
    expect(isTrustedMutationOrigin(request('https://admin.eremin.site'))).toBe(true);
  });
});
