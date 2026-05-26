import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { promosKey, queueKey, queuesIndexKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readQueue } from '@/lib/catalogue';
import { env } from '@/env';
import { PUT } from './route';

const SECRET = 'unit-test-secret';

const seedQueue = (ids: string[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queueKey('main'), Body: JSON.stringify({ persist: false, ids }), ContentType: 'application/json',
  }));

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/queue', {
    method: init.method ?? 'PUT',
    body: init.body,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-queue-route/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await Promise.allSettled([
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: promosKey() })),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('main') })),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queuesIndexKey() })),
  ]);
  process.env = { ...ORIGINAL };
});

describe('PUT /api/queue', () => {
  it('reorders the main queue to the given id sequence (200)', async () => {
    await seedQueue(['a', 'b']);
    const res = await PUT(authed({ body: JSON.stringify({ ids: ['b', 'a'] }) }));
    expect(res.status).toBe(200);
    const queue = await readQueue('main');
    expect(queue.ids).toEqual(['b', 'a']);
  });

  it('400 reorder_mismatch when ids are not a permutation', async () => {
    await seedQueue(['a', 'b']);
    const res = await PUT(authed({ body: JSON.stringify({ ids: ['a'] }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'reorder_mismatch' });
  });

  it('400 invalid_body on a malformed body', async () => {
    const res = await PUT(authed({ body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_body' });
  });

  it('401 without a valid session', async () => {
    const res = await PUT(new NextRequest('http://localhost/api/queue', { method: 'PUT' }));
    expect(res.status).toBe(401);
  });
});
