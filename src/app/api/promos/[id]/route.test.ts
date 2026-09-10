import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { promosKey, queueKey, queuesIndexKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readPool, readQueue } from '@/lib/catalogue';
import { env } from '@/env';
import type { Promo } from '@/lib/schema';
import { PUT, DELETE } from './route';

const SECRET = 'unit-test-secret';

const promo = (id: string, format: Promo['format'] = 'inline') => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, cooldownHours: 0, format, title: id,
});

const seedPool = (promos: unknown[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: promosKey(), Body: JSON.stringify(promos), ContentType: 'application/json',
  }));

const seedNamedQueue = (name: string, persist: boolean, ids: string[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queueKey(name), Body: JSON.stringify({ persist, ids }), ContentType: 'application/json',
  }));
const seedQueue = (ids: string[]) => seedNamedQueue('main', false, ids);
const seedQueuesIndex = (entries: { name: string; persist: boolean }[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queuesIndexKey(), Body: JSON.stringify(entries), ContentType: 'application/json',
  }));

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/promos/a', {
    method: init.method,
    body: init.body,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });
const ctx = (id: string) => ({ params: { id } });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-promos-id/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await Promise.allSettled([
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: promosKey() })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('main') })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('secondary') })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('persistent-inline') })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('persistent-topline') })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queuesIndexKey() })).catch(() => {}),
  ]);
  process.env = { ...ORIGINAL };
});

describe('PUT /api/promos/[id]', () => {
  it('updates an existing promo (200)', async () => {
    await seedPool([promo('a')]);
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({ ...promo('a'), title: 'New' }) }), ctx('a'));
    expect(res.status).toBe(200);
  });

  it('404 when the id is missing', async () => {
    await seedPool([promo('a')]);
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify(promo('zzz')) }), ctx('zzz'));
    expect(res.status).toBe(404);
  });

  it('400 when the body id does not match the path id', async () => {
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify(promo('b')) }), ctx('a'));
    expect(res.status).toBe(400);
  });

  it('keeps format changes allowed while the promo belongs only to unrestricted queues', async () => {
    await seedPool([promo('a')]);
    await seedQueuesIndex([{ name: 'main', persist: false }]);
    await seedQueue(['a']);

    const res = await PUT(
      authed({ method: 'PUT', body: JSON.stringify(promo('a', 'promoline')) }),
      ctx('a'),
    );

    expect(res.status).toBe(200);
    expect((await readPool()).find((item) => item.id === 'a')?.format).toBe('promoline');
  });

  it('rejects a format incompatible with every fixed queue containing the promo', async () => {
    await seedPool([promo('a', 'topline')]);
    await seedQueuesIndex([
      { name: 'main', persist: false },
      { name: 'persistent-topline', persist: true },
      { name: 'persistent-inline', persist: true },
    ]);
    await seedQueue(['a']);
    await seedNamedQueue('persistent-topline', true, ['a']);
    await seedNamedQueue('persistent-inline', true, ['a']);

    const res = await PUT(
      authed({ method: 'PUT', body: JSON.stringify({ ...promo('a', 'popup'), title: 'Changed' }) }),
      ctx('a'),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'format_not_allowed',
      promoFormat: 'popup',
      incompatibleQueues: [
        { queue: 'persistent-topline', allowedFormats: ['topline'] },
        { queue: 'persistent-inline', allowedFormats: ['inline'] },
      ],
    });
    expect((await readPool()).find((item) => item.id === 'a')).toMatchObject({
      format: 'topline',
      title: 'a',
    });
  });

  it('does not mutate the pool when a fixed queue cannot be read safely', async () => {
    await seedPool([promo('a', 'topline')]);
    await seedQueuesIndex([{ name: 'persistent-topline', persist: true }]);
    await getS3Client().send(new PutObjectCommand({
      Bucket: env.promoBucket,
      Key: queueKey('persistent-topline'),
      Body: JSON.stringify({ persist: true, ids: 'broken' }),
      ContentType: 'application/json',
    }));

    const res = await PUT(
      authed({ method: 'PUT', body: JSON.stringify({ ...promo('a', 'topline'), title: 'Changed' }) }),
      ctx('a'),
    );

    expect(res.status).toBe(502);
    expect((await readPool()).find((item) => item.id === 'a')?.title).toBe('a');
  });
});

describe('DELETE /api/promos/[id]', () => {
  it('removes from BOTH pool and all queues', async () => {
    await seedPool([promo('a')]);
    await seedQueuesIndex([{ name: 'main', persist: false }]);
    await seedQueue(['a']);
    const res = await DELETE(authed({ method: 'DELETE' }), ctx('a'));
    expect(res.status).toBe(200);
    const pool = await readPool();
    const queue = await readQueue('main');
    expect(pool.find((p) => p.id === 'a')).toBeUndefined();
    expect(queue.ids).toEqual([]);
  });

  it('deletes an existing promo not in any queue (200)', async () => {
    await seedPool([promo('a')]);
    const res = await DELETE(authed({ method: 'DELETE' }), ctx('a'));
    expect(res.status).toBe(200);
  });

  it('404 when the id is missing from pool', async () => {
    await seedPool([promo('a')]);
    const res = await DELETE(authed({ method: 'DELETE' }), ctx('zzz'));
    expect(res.status).toBe(404);
  });

  it('hard delete clears id from ALL named queues', async () => {
    await seedPool([promo('a')]);
    await seedQueuesIndex([{ name: 'main', persist: false }, { name: 'secondary', persist: true }]);
    await seedQueue(['a']);
    // Also seed secondary queue with 'a'
    await getS3Client().send(new PutObjectCommand({
      Bucket: env.promoBucket, Key: queueKey('secondary'),
      Body: JSON.stringify({ persist: true, ids: ['a'] }), ContentType: 'application/json',
    }));
    const res = await DELETE(authed({ method: 'DELETE' }), ctx('a'));
    expect(res.status).toBe(200);
    expect((await readPool()).find((p) => p.id === 'a')).toBeUndefined();
    expect((await readQueue('main')).ids).toEqual([]);
    expect((await readQueue('secondary')).ids).toEqual([]);
  });
});
