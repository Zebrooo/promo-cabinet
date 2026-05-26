import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readPool, writePool, readQueue, writeQueue, mutatePool, mutateQueue, readState } from './catalogue';
import { addPromo, enqueue } from './mutations';
import { promosKey, queueKey, getS3Client, resetS3ClientForTests } from './s3';
import { env } from '@/env';
import type { Promo } from './schema';

const make = (id: string): Promo => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: id,
});

const put = (key: string, text: string) =>
  getS3Client().send(new PutObjectCommand({ Bucket: env.promoBucket, Key: key, Body: text, ContentType: 'application/json' }));

beforeEach(() => {
  process.env.PROMO_KEY_PREFIX = `test/store/${randomUUID()}/`;
  resetS3ClientForTests();
});

afterEach(async () => {
  const c = getS3Client();
  await c.send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: promosKey() })).catch(() => {});
  await c.send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey() })).catch(() => {});
});

describe('pool', () => {
  it('reads written promos', async () => {
    await writePool([make('a'), make('b')]);
    expect((await readPool()).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('reads empty when the object is missing', async () => {
    expect(await readPool()).toEqual([]);
  });
  it('mutatePool applies and persists', async () => {
    await writePool([make('a')]);
    const next = await mutatePool((promos) => addPromo(promos, make('b')));
    expect(next.map((p) => p.id)).toEqual(['a', 'b']);
    expect((await readPool()).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('queue', () => {
  it('reads written ids', async () => {
    await writeQueue(['a', 'b']);
    expect(await readQueue()).toEqual(['a', 'b']);
  });
  it('reads empty when the object is missing', async () => {
    expect(await readQueue()).toEqual([]);
  });
  it('mutateQueue applies and persists', async () => {
    await writeQueue(['a']);
    const next = await mutateQueue((ids) => enqueue(ids, 'b'));
    expect(next).toEqual(['a', 'b']);
    expect(await readQueue()).toEqual(['a', 'b']);
  });
});

describe('readState', () => {
  it('returns both pool and queue', async () => {
    await writePool([make('a')]);
    await writeQueue(['a']);
    expect(await readState()).toEqual({ promos: [make('a')], queue: ['a'] });
  });
  it('returns empty pool and queue when nothing is written', async () => {
    expect(await readState()).toEqual({ promos: [], queue: [] });
  });
});
