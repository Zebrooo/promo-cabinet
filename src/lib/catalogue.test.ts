import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  readPool, writePool, readQueue, writeQueue, mutatePool, mutateQueue,
  readQueuesIndex, writeQueuesIndex, ensureMainQueue, readState, CANONICAL_QUEUES,
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
  await Promise.allSettled([
    del(promosKey()),
    del(queuesIndexKey()),
    del(queueKey('main')),
    del(queueKey('promo-test')),
    del(legacyQueueKey()),
    ...CANONICAL_QUEUES.map((q) => del(queueKey(q.name))),
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
  it('skips an invalid promo instead of failing the whole read (one bad promo must not dark the cabinet)', async () => {
    // 2 валидных + 1 битое (без title — форма инцидента 2026-07-03: custom-промо
    // без title валило poolSchema.parse на весь массив).
    const bad = { id: 'bad', name: 'bad', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z', targeting: {}, cooldownHours: 0, format: 'inline' };
    await put(promosKey(), JSON.stringify([make('a'), bad, make('b')]));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pool = await readPool();
    expect(pool.map((p) => p.id)).toEqual(['a', 'b']); // битое отброшено, валидные целы
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].some((a) => JSON.stringify(a).includes('bad'))).toBe(true); // id битого залогирован
    warn.mockRestore();
  });
  it('reads empty (with warn) when the pool JSON is not an array', async () => {
    await put(promosKey(), JSON.stringify({ not: 'an array' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await readPool()).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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
  it('creates queue-main.json + queues.json from legacy queue.json (plus canonical queues)', async () => {
    // Seed legacy queue.json (bare id array)
    await put(legacyQueueKey(), JSON.stringify(['legacy-a', 'legacy-b']));

    await ensureMainQueue();

    const idx = await readQueuesIndex();
    expect(idx).toEqual([{ name: 'main', persist: false }, ...CANONICAL_QUEUES]);

    const q = await readQueue('main');
    expect(q.ids).toEqual(['legacy-a', 'legacy-b']);
    expect(q.persist).toBe(false);
  });

  it('creates empty queue-main.json + queues.json when no legacy queue.json', async () => {
    await ensureMainQueue();

    const idx = await readQueuesIndex();
    expect(idx).toEqual([{ name: 'main', persist: false }, ...CANONICAL_QUEUES]);

    const q = await readQueue('main');
    expect(q.ids).toEqual([]);
  });

  it('leaves existing entries untouched, only filling in missing canonical queues', async () => {
    await writeQueuesIndex([{ name: 'main', persist: false }, { name: 'other', persist: true }]);
    await writeQueue('main', { persist: false, ids: ['existing'] });

    await ensureMainQueue();

    const idx = await readQueuesIndex();
    expect(idx).toHaveLength(2 + CANONICAL_QUEUES.length);
    expect(idx.slice(0, 2)).toEqual([{ name: 'main', persist: false }, { name: 'other', persist: true }]);
    const q = await readQueue('main');
    expect(q.ids).toEqual(['existing']);
  });

  it('bootstraps 12 canonical queues + main on an empty store', async () => {
    await ensureMainQueue();
    const idx = await readQueuesIndex();
    expect(idx).toHaveLength(13); // main + 12 canonical (4 legacy + 8 catalog)
    const names = new Set(idx.map((q) => q.name));
    for (const name of ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing']) {
      expect(names.has(name), `catalog queue "${name}" must be bootstrapped`).toBe(true);
    }
  });

  it('is idempotent — a second call adds nothing', async () => {
    await ensureMainQueue();
    const first = await readQueuesIndex();
    await ensureMainQueue();
    expect(await readQueuesIndex()).toEqual(first);
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
