import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { queuesIndexKey, queueKey, promosKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readQueue, readQueuesIndex } from '@/lib/catalogue';
import { env } from '@/env';
import { GET, PUT, PATCH, DELETE } from './route';

const SECRET = 'unit-test-secret';

const ORIGINAL = { ...process.env };
const authed = (name: string, init: RequestInit = {}) =>
  new NextRequest(`http://localhost/api/queues/${name}`, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });
const ctx = (name: string) => ({ params: { name } });

const seedPool = (promos: unknown[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: promosKey(), Body: JSON.stringify(promos), ContentType: 'application/json',
  }));

const seedIndex = (entries: { name: string; persist: boolean }[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queuesIndexKey(), Body: JSON.stringify(entries), ContentType: 'application/json',
  }));

const seedQueue = (name: string, persist: boolean, ids: string[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: queueKey(name), Body: JSON.stringify({ persist, ids }), ContentType: 'application/json',
  }));

const promo = (id: string) => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, cooldownHours: 0, format: 'inline' as const, title: id,
});

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-queues-name/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await Promise.allSettled([
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: promosKey() })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queuesIndexKey() })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('main') })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('other') })).catch(() => {}),
    getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey('renamed') })).catch(() => {}),
  ]);
  process.env = { ...ORIGINAL };
});

describe('GET /api/queues/[name]', () => {
  it('resolves promo ids to promo objects (skips dangling)', async () => {
    await seedPool([promo('a'), promo('b')]);
    await seedQueue('main', false, ['a', 'dangling', 'b']);
    const res = await GET(authed('main'), ctx('main'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persist).toBe(false);
    expect(body.ids).toEqual(['a', 'dangling', 'b']);
    // promos only contains resolved ones
    expect(body.promos.map((p: { id: string }) => p.id)).toEqual(['a', 'b']);
  });

  it('returns empty queue when missing', async () => {
    const res = await GET(authed('main'), ctx('main'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ids).toEqual([]);
    expect(body.promos).toEqual([]);
  });

  it('401 without a valid session', async () => {
    const res = await GET(new NextRequest('http://localhost/api/queues/main'), ctx('main'));
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/queues/[name]', () => {
  it('reorders the queue (200)', async () => {
    await seedQueue('main', false, ['a', 'b']);
    const res = await PUT(authed('main', { method: 'PUT', body: JSON.stringify({ ids: ['b', 'a'] }) }), ctx('main'));
    expect(res.status).toBe(200);
    const q = await readQueue('main');
    expect(q.ids).toEqual(['b', 'a']);
  });

  it('400 reorder_mismatch when ids not a permutation', async () => {
    await seedQueue('main', false, ['a', 'b']);
    const res = await PUT(authed('main', { method: 'PUT', body: JSON.stringify({ ids: ['a'] }) }), ctx('main'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'reorder_mismatch' });
  });

  it('401 without a valid session', async () => {
    const res = await PUT(new NextRequest('http://localhost/api/queues/main', { method: 'PUT' }), ctx('main'));
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/queues/[name]', () => {
  it('toggles persist', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    await seedQueue('main', false, ['a']);
    const res = await PATCH(authed('main', { method: 'PATCH', body: JSON.stringify({ persist: true }) }), ctx('main'));
    expect(res.status).toBe(200);
    const q = await readQueue('main');
    expect(q.persist).toBe(true);
    const idx = await readQueuesIndex();
    expect(idx.find((e) => e.name === 'main')?.persist).toBe(true);
  });

  it('renames a queue and updates the index', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    await seedQueue('main', false, ['a']);
    const res = await PATCH(authed('main', { method: 'PATCH', body: JSON.stringify({ rename: 'renamed' }) }), ctx('main'));
    expect(res.status).toBe(200);
    const idx = await readQueuesIndex();
    expect(idx.some((e) => e.name === 'renamed')).toBe(true);
    expect(idx.some((e) => e.name === 'main')).toBe(false);
    const q = await readQueue('renamed');
    expect(q.ids).toEqual(['a']);
  });

  it('409 when rename conflicts with existing name', async () => {
    await seedIndex([{ name: 'main', persist: false }, { name: 'other', persist: false }]);
    await seedQueue('main', false, []);
    const res = await PATCH(authed('main', { method: 'PATCH', body: JSON.stringify({ rename: 'other' }) }), ctx('main'));
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/queues/[name]', () => {
  it('removes queue from index and deletes the object', async () => {
    await seedIndex([{ name: 'main', persist: false }, { name: 'other', persist: false }]);
    await seedQueue('other', false, []);
    const res = await DELETE(authed('other', { method: 'DELETE' }), ctx('other'));
    expect(res.status).toBe(200);
    const idx = await readQueuesIndex();
    expect(idx.some((e) => e.name === 'other')).toBe(false);
    expect(idx.some((e) => e.name === 'main')).toBe(true);
  });

  it('404 when deleting an unknown queue name', async () => {
    await seedIndex([{ name: 'main', persist: false }]);
    const res = await DELETE(authed('other', { method: 'DELETE' }), ctx('other'));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
    const idx = await readQueuesIndex();
    expect(idx.some((e) => e.name === 'main')).toBe(true);
  });

  it('401 without a valid session', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/queues/other', { method: 'DELETE' }), ctx('other'));
    expect(res.status).toBe(401);
  });
});
