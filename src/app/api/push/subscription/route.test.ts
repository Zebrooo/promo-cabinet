import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, pushSubscriptionsKey, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readPushSubscriptions } from '@/lib/push-subscriptions';
import { env } from '@/env';
import { DELETE, POST } from './route';

const SECRET = 'unit-test-secret';
const ORIGINAL = { ...process.env };

const sub = { endpoint: 'https://push.example.com/send/1', keys: { p256dh: 'p', auth: 'a' } };

const request = (method: 'POST' | 'DELETE', body: unknown, authed = true) =>
  new NextRequest('http://localhost/api/push/subscription', {
    method,
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'user-agent': 'TestBrowser/1.0',
      ...(authed ? { cookie: `promo_session=${createSessionToken(SECRET)}` } : {}),
    },
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-push/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: pushSubscriptionsKey() })).catch(() => {});
  process.env = { ...ORIGINAL };
});

describe('POST /api/push/subscription', () => {
  it('stores the browser subscription with its user agent', async () => {
    const res = await POST(request('POST', sub));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, total: 1 });
    const stored = await readPushSubscriptions();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ ...sub, userAgent: 'TestBrowser/1.0' });
  });

  it('400 on a malformed or non-https subscription', async () => {
    expect((await POST(request('POST', { endpoint: 'nope' }))).status).toBe(400);
    expect((await POST(request('POST', { ...sub, endpoint: 'http://push.example.com/1' }))).status).toBe(400);
    expect(await readPushSubscriptions()).toEqual([]);
  });

  it('401 without a session', async () => {
    expect((await POST(request('POST', sub, false))).status).toBe(401);
  });
});

describe('DELETE /api/push/subscription', () => {
  it('removes the subscription by endpoint', async () => {
    await POST(request('POST', sub));
    const res = await DELETE(request('DELETE', { endpoint: sub.endpoint }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, total: 0 });
    expect(await readPushSubscriptions()).toEqual([]);
  });

  it('400 without an endpoint, 401 without a session', async () => {
    expect((await DELETE(request('DELETE', {}))).status).toBe(400);
    expect((await DELETE(request('DELETE', { endpoint: sub.endpoint }, false))).status).toBe(401);
  });
});
