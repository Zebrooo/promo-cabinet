import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { catalogueKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { readCatalogue } from '@/lib/catalogue';
import { env } from '@/env';
import { PUT } from './route';

const SECRET = 'unit-test-secret';

const promo = (id: string) => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline' as const, title: id,
});

const seed = (promos: unknown[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: catalogueKey(), Body: JSON.stringify(promos), ContentType: 'application/json',
  }));

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/promos/reorder', {
    method: init.method,
    body: init.body,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-reorder/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: catalogueKey() })).catch(() => {});
  process.env = { ...ORIGINAL };
});

describe('PUT /api/promos/reorder', () => {
  it('reorders to the given id sequence (200)', async () => {
    await seed([promo('a'), promo('b')]);
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({ ids: ['b', 'a'] }) }));
    expect(res.status).toBe(200);
    const { promos } = await readCatalogue();
    expect(promos.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('400 when ids are not a permutation', async () => {
    await seed([promo('a'), promo('b')]);
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({ ids: ['a'] }) }));
    expect(res.status).toBe(400);
  });

  it('400 on a malformed body', async () => {
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });
});
