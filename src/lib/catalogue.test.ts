import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  readPool, writePool, readQueue, writeQueue, mutatePool, mutateQueue,
  readQueuesIndex, writeQueuesIndex, ensureMainQueue, readState,
} from './catalogue';
import { addPromo, enqueue } from './mutations';
import { promosKey, queueKey, queuesIndexKey, legacyQueueKey, getS3Client, resetS3ClientForTests } from './s3';
import { env } from '@/env';
import type { Promo } from './schema';

const make = (id: string): Promo => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, cooldownHours: 0, format: 'inline', title: id,
});

const put = (key: string, text: string) =>
  getS3Client().send(new PutObjectCommand({ Bucket: env.promoBucket, Key: key, Body: text, ContentType: 'application/json' }));

const del = (key: string) =>
  getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: key })).catch(() => {});

beforeEach(() => {
  process.env.PROMO_KEY_PREFIX = `test/store/${randomUUID()}/`;
  resetS3ClientForTests();
});

afterEach(async () => {
  const c = getS3Client();
  await Promise.allSettled([
    del(promosKey()),
    del(queuesIndexKey()),
    del(queueKey('main')),
    del(queueKey('promo-test')),
    del(legacyQueueKey()),
  ]);
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

describe('queues index', () => {
  it('reads written index', async () => {
    await writeQueuesIndex([{ name: 'main', persist: false }, { name: 'promo-test', persist: true }]);
    const idx = await readQueuesIndex();
    expect(idx).toEqual([{ name: 'main', persist: false }, { name: 'promo-test', persist: true }]);
  });
  it('reads empty array when the object is missing', async () => {
    expect(await readQueuesIndex()).toEqual([]);
  });
});

describe('named queue (queue-<name>.json)', () => {
  it('reads written { persist, ids } for a named queue', async () => {
    await writeQueue('main', { persist: false, ids: ['a', 'b'] });
    const q = await readQueue('main');
    expect(q).toEqual({ persist: false, ids: ['a', 'b'] });
  });
  it('reads default { persist:false, ids:[] } when missing', async () => {
    expect(await readQueue('main')).toEqual({ persist: false, ids: [] });
  });
  it('persist: true round-trips', async () => {
    await writeQueue('promo-test', { persist: true, ids: ['x'] });
    const q = await readQueue('promo-test');
    expect(q.persist).toBe(true);
    expect(q.ids).toEqual(['x']);
  });
  it('mutateQueue applies and persists', async () => {
    await writeQueue('main', { persist: false, ids: ['a'] });
    const next = await mutateQueue('main', (q) => ({ ...q, ids: enqueue(q.ids, 'b') }));
    expect(next.ids).toEqual(['a', 'b']);
    expect((await readQueue('main')).ids).toEqual(['a', 'b']);
  });
});

describe('ensureMainQueue', () => {
  it('creates queue-main.json + queues.json from legacy queue.json', async () => {
    // Seed legacy queue.json (bare id array)
    await put(legacyQueueKey(), JSON.stringify(['legacy-a', 'legacy-b']));

    await ensureMainQueue();

    const idx = await readQueuesIndex();
    expect(idx).toEqual([{ name: 'main', persist: false }]);

    const q = await readQueue('main');
    expect(q.ids).toEqual(['legacy-a', 'legacy-b']);
    expect(q.persist).toBe(false);
  });

  it('creates empty queue-main.json + queues.json when no legacy queue.json', async () => {
    await ensureMainQueue();

    const idx = await readQueuesIndex();
    expect(idx).toEqual([{ name: 'main', persist: false }]);

    const q = await readQueue('main');
    expect(q.ids).toEqual([]);
  });

  it('is a no-op if queues.json already exists with entries', async () => {
    await writeQueuesIndex([{ name: 'main', persist: false }, { name: 'other', persist: true }]);
    await writeQueue('main', { persist: false, ids: ['existing'] });

    await ensureMainQueue();

    const idx = await readQueuesIndex();
    expect(idx).toHaveLength(2);
    const q = await readQueue('main');
    expect(q.ids).toEqual(['existing']);
  });
});

describe('readState', () => {
  it('returns both promos and queues index', async () => {
    await writePool([make('a')]);
    await writeQueuesIndex([{ name: 'main', persist: false }]);
    const state = await readState();
    expect(state.promos.map((p) => p.id)).toEqual(['a']);
    expect(state.queues).toEqual([{ name: 'main', persist: false }]);
  });
  it('returns empty pool and queues when nothing written', async () => {
    expect(await readState()).toEqual({ promos: [], queues: [] });
  });
});
