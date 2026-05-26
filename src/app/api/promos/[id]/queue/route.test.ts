import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { promosKey, queueKey, queuesIndexKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readPool, readQueue } from '@/lib/catalogue';
import { env } from '@/env';
import { POST, DELETE } from './route';

const SECRET = 'unit-test-secret';

const promo = (id: string) => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, cooldownHours: 0, format: 'inline' as const, title: id,
});

const seedPool = (promos: unknown[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: promosKey(), Body: JSON.stringify(promos), ContentType: 'application/json',
  }));

const seedQueue = (ids: string[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queueKey('main'), Body: JSON.stringify({ persist: false, ids }), ContentType: 'application/json',
  }));

const ORIGINAL = { ...process.env };
const authed = (id: string, method = 'POST', init: RequestInit = {}) =>
  new NextRequest(`http://localhost/api/promos/${id}/queue`, {
    method,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });
const ctx = (id: string) => ({ params: { id } });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-queue/${randomUUID()}/`;
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

describe('POST /api/promos/[id]/queue', () => {
  it('enqueues: main queue has the id; pool unchanged', async () => {
    await seedPool([promo('a')]);
    const res = await POST(authed('a'), ctx('a'));
    expect(res.status).toBe(200);
    const queue = await readQueue('main');
    const pool = await readPool();
    expect(queue.ids).toContain('a');
    expect(pool.map((p) => p.id)).toContain('a');
  });

  it('404 when promo does not exist in the pool', async () => {
    const res = await POST(authed('unknown'), ctx('unknown'));
    expect(res.status).toBe(404);
  });

  it('401 without a valid session', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/promos/a/queue', { method: 'POST' }),
      ctx('a'),
    );
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/promos/[id]/queue', () => {
  it('dequeues from main: queue empty; pool still has the promo', async () => {
    await seedPool([promo('a')]);
    await seedQueue(['a']);
    const res = await DELETE(authed('a', 'DELETE'), ctx('a'));
    expect(res.status).toBe(200);
    const queue = await readQueue('main');
    const pool = await readPool();
    expect(queue.ids).toEqual([]);
    expect(pool.map((p) => p.id)).toContain('a');
  });

  it('dequeue is idempotent (id not in queue — still 200)', async () => {
    const res = await DELETE(authed('a', 'DELETE'), ctx('a'));
    expect(res.status).toBe(200);
  });
});
