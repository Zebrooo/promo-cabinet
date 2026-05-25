import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { catalogueKey, getS3Client, resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { env } from '@/env';
import { GET, POST } from './route';

const SECRET = 'unit-test-secret';

const validPromo = {
  id: 'a', name: 'A', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: 'A',
};

/** Pre-seed the catalogue object for the current (unique) test prefix. */
const seed = (promos: unknown[]) =>
  getS3Client().send(new PutObjectCommand({
    Bucket: env.promoBucket, Key: catalogueKey(), Body: JSON.stringify(promos), ContentType: 'application/json',
  }));

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/promos', {
    ...init,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_KEY_PREFIX = `test/api-promos/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: catalogueKey() })).catch(() => {});
  process.env = { ...ORIGINAL };
});

describe('GET /api/promos', () => {
  it('returns the catalogue', async () => {
    await seed([validPromo]);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([validPromo]);
  });

  it('401 without a valid session', async () => {
    const res = await GET(new NextRequest('http://localhost/api/promos'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/promos', () => {
  it('creates a promo (201)', async () => {
    const res = await POST(authed({ method: 'POST', body: JSON.stringify(validPromo) }));
    expect(res.status).toBe(201);
  });

  it('409 on a duplicate id', async () => {
    await seed([validPromo]);
    const res = await POST(authed({ method: 'POST', body: JSON.stringify(validPromo) }));
    expect(res.status).toBe(409);
  });

  it('400 on an invalid promo', async () => {
    const res = await POST(authed({ method: 'POST', body: JSON.stringify({ id: '' }) }));
    expect(res.status).toBe(400);
  });
});
