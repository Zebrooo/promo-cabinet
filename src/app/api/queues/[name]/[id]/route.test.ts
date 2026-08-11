import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { queuesIndexKey, queueKey, promosKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readQueue } from '@/lib/catalogue';
import { env } from '@/env';
import { POST, DELETE } from './route';

const SECRET = 'unit-test-secret';

const ORIGINAL = { ...process.env };
const authed = (name: string, id: string, method = 'POST') =>
  new NextRequest(`http://localhost/api/queues/${name}/${id}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}` },
  });
const ctx = (name: string, id: string) => ({ params: { name, id } });

const promo = (id: string) => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, cooldownHours: 0, format: 'inline' as const, title: id,
});

const seedPool = (promos: unknown[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: promosKey(), Body: JSON.stringify(promos), ContentType: 'application/json',
  }));

const seedQueue = (name: string, persist: boolean, ids: string[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queueKey(name), Body: JSON.stringify({ persist, ids }), ContentType: 'application/json',
  }));

const seedIndex = (entries: { name: string; persist: boolean }[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queuesIndexKey(), Body: JSON.stringify(entries), ContentType: 'application/json',
  }));

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-queues-name-id/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await Promise.allSettled([
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: promosKey() })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queuesIndexKey() })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('main') })).catch(() => {}),
  ]);
  process.env = { ...ORIGINAL };
});

describe('POST /api/queues/[name]/[id]', () => {
  it('enqueues a promo into the named queue (200)', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    await seedPool([promo('a')]);
    const res = await POST(authed('main', 'a'), ctx('main', 'a'));
    expect(res.status).toBe(200);
    const q = await readQueue('main');
    expect(q.ids).toContain('a');
  });

  it('is idempotent (enqueueing again is still 200)', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    await seedPool([promo('a')]);
    await seedQueue('main', false, ['a']);
    const res = await POST(authed('main', 'a'), ctx('main', 'a'));
    expect(res.status).toBe(200);
    const q = await readQueue('main');
    expect(q.ids).toEqual(['a']); // still only one entry
  });

  it('404 when promo not in pool', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    const res = await POST(authed('main', 'unknown'), ctx('main', 'unknown'));
    expect(res.status).toBe(404);
  });

  it('404 queue_not_found when the queue name is not registered (no orphan file created)', async () => {
    await seedPool([promo('a')]);
    const res = await POST(authed('ghost', 'a'), ctx('ghost', 'a'));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'queue_not_found' });
  });

  it('401 without a valid session', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/queues/main/a', { method: 'POST' }),
      ctx('main', 'a'),
    );
    expect(res.status).toBe(401);
  });

  it('returns only ok when enqueueing a promo', async () => {
    await seedIndex([{ name: 'home', persist: false }]);
    await seedPool([promo('p1')]);
    const res = await POST(authed('home', 'p1'), ctx('home', 'p1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('enqueues multistep into home without a format warning', async () => {
    await seedIndex([{ name: 'home', persist: false }]);
    const multistepPromo = {
      ...promo('ms1'),
      format: 'multistep' as const,
      steps: [
        { title: 'Шаг 1', body: 'Текст первого шага' },
        { title: 'Шаг 2', body: 'Текст второго шага' },
      ],
    };
    await seedPool([multistepPromo]);
    const res = await POST(authed('home', 'ms1'), ctx('home', 'ms1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await readQueue('home')).ids).toContain('ms1');
  });
});

describe('DELETE /api/queues/[name]/[id]', () => {
  it('dequeues a promo from the named queue (200)', async () => {
    await seedPool([promo('a')]);
    await seedQueue('main', false, ['a']);
    const res = await DELETE(authed('main', 'a', 'DELETE'), ctx('main', 'a'));
    expect(res.status).toBe(200);
    const q = await readQueue('main');
    expect(q.ids).toEqual([]);
  });

  it('is idempotent (dequeue when not in queue is still 200)', async () => {
    const res = await DELETE(authed('main', 'x', 'DELETE'), ctx('main', 'x'));
    expect(res.status).toBe(200);
  });

  it('401 without a valid session', async () => {
    const res = await DELETE(
      new NextRequest('http://localhost/api/queues/main/a', { method: 'DELETE' }),
      ctx('main', 'a'),
    );
    expect(res.status).toBe(401);
  });
});
