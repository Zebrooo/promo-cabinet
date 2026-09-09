import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, pushSubscriptionsKey, resetS3ClientForTests } from '@/lib/s3';
import { env } from '@/env';
import { readPushSubscriptions, removePushSubscription, upsertPushSubscription } from './push-subscriptions';

const ORIGINAL = { ...process.env };

const sub = (n: number) => ({
  endpoint: `https://push.example.com/send/${n}`,
  keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
});

const readRaw = async () => {
  const res = await getS3Client().send(new GetObjectCommand({ Bucket: env.promoBucket, Key: pushSubscriptionsKey() }));
  return JSON.parse(await res.Body!.transformToString());
};

beforeEach(() => {
  process.env.PROMO_KEY_PREFIX = `test/push-subscriptions/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(async () => {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: pushSubscriptionsKey() })).catch(() => {});
  process.env = { ...ORIGINAL };
});

describe('push-subscriptions', () => {
  it('reads [] when the object does not exist', async () => {
    expect(await readPushSubscriptions()).toEqual([]);
  });

  it('upserts by endpoint, keeping the original createdAt and writing the shared file shape', async () => {
    const now = new Date('2026-09-01T10:00:00.000Z');
    await upsertPushSubscription(sub(1), { userAgent: 'UA-1', now });
    await upsertPushSubscription(sub(2), { now: new Date('2026-09-02T10:00:00.000Z') });
    const rotated = { ...sub(1), keys: { p256dh: 'new', auth: 'new' } };
    const all = await upsertPushSubscription(rotated, { now: new Date('2026-09-03T10:00:00.000Z') });

    expect(all.map((s) => s.endpoint)).toEqual([sub(2).endpoint, sub(1).endpoint]);
    const first = all.find((s) => s.endpoint === sub(1).endpoint)!;
    expect(first.keys).toEqual({ p256dh: 'new', auth: 'new' });
    expect(first.createdAt).toBe(now.toISOString());
    expect(first.userAgent).toBeUndefined();

    const raw = await readRaw();
    expect(raw.version).toBe(1);
    expect(raw.subscriptions).toHaveLength(2);
    expect(await readPushSubscriptions()).toEqual(all);
  });

  it('removes by endpoint idempotently', async () => {
    await upsertPushSubscription(sub(1));
    await upsertPushSubscription(sub(2));
    expect((await removePushSubscription(sub(1).endpoint)).map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
    expect((await removePushSubscription(sub(1).endpoint)).map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
    expect(await readPushSubscriptions()).toHaveLength(1);
  });

  it('skips malformed entries and tolerates an unexpected file shape', async () => {
    const put = (body: unknown) =>
      getS3Client().send(new PutObjectCommand({ Bucket: env.promoBucket, Key: pushSubscriptionsKey(), Body: JSON.stringify(body), ContentType: 'application/json' }));
    await put({ version: 1, subscriptions: [
      { ...sub(1), createdAt: 'x' },
      { endpoint: 'http://insecure/1', keys: sub(1).keys, createdAt: 'x' },
      { endpoint: 'https://ok/2' },
      42,
    ] });
    expect((await readPushSubscriptions()).map((s) => s.endpoint)).toEqual([sub(1).endpoint]);

    await put({ nope: true });
    expect(await readPushSubscriptions()).toEqual([]);
  });
});
