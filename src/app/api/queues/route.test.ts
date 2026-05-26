import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { queuesIndexKey, queueKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readQueuesIndex, readQueue } from '@/lib/catalogue';
import { env } from '@/env';
import { GET, POST } from './route';

const SECRET = 'unit-test-secret';

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/queues', {
    method: init.method ?? 'GET',
    body: init.body,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });

const seedIndex = (entries: { name: string; persist: boolean }[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queuesIndexKey(), Body: JSON.stringify(entries), ContentType: 'application/json',
  }));

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-queues/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await Promise.allSettled([
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queuesIndexKey() })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('main') })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('promo-test') })).catch(() => {}),
  ]);
  process.env = { ...ORIGINAL };
});

describe('GET /api/queues', () => {
  it('returns the index (creating main if empty)', async () => {
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.queues)).toBe(true);
    // ensureMainQueue should have created main
    expect(body.queues).toEqual([{ name: 'main', persist: false }]);
  });

  it('returns existing index without modification', async () => {
    await seedIndex([{ name: 'main', persist: false }, { name: 'promo-test', persist: true }]);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queues).toEqual([{ name: 'main', persist: false }, { name: 'promo-test', persist: true }]);
  });

  it('401 without a valid session', async () => {
    const res = await GET(new NextRequest('http://localhost/api/queues'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/queues', () => {
  it('creates a new queue (201)', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    const res = await POST(authed({ method: 'POST', body: JSON.stringify({ name: 'promo-test', persist: true }) }));
    expect(res.status).toBe(201);
    const index = await readQueuesIndex();
    expect(index).toContainEqual({ name: 'promo-test', persist: true });
    const queue = await readQueue('promo-test');
    expect(queue).toEqual({ persist: true, ids: [] });
  });

  it('409 when queue name already exists', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    const res = await POST(authed({ method: 'POST', body: JSON.stringify({ name: 'main', persist: false }) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'duplicate_queue' });
  });

  it('400 on invalid body', async () => {
    const res = await POST(authed({ method: 'POST', body: JSON.stringify({ name: '' }) }));
    expect(res.status).toBe(400);
  });

  it('401 without a valid session', async () => {
    const res = await POST(new NextRequest('http://localhost/api/queues', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
