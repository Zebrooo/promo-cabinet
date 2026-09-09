import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resetS3ClientForTests } from './s3';
import { mutatePool, mutateQueue, readPool, readQueue } from './catalogue';
import { withLock } from './catalogue-lock';
import type { Promo } from './schema';

const promo = (id: string): Promo => ({
  id, name: id, title: id, format: 'inline',
  startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z',
  targeting: {}, cooldownHours: 0,
});

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env.PROMO_KEY_PREFIX = `test/lock/${randomUUID()}/`;
  resetS3ClientForTests();
});
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('withLock', () => {
  it('runs sections with the same key one at a time and different keys concurrently', async () => {
    const log: string[] = [];
    const section = (key: string, tag: string) => withLock(key, async () => {
      log.push(`${tag}:start`);
      await new Promise((r) => setTimeout(r, 5));
      log.push(`${tag}:end`);
    });
    await Promise.all([section('a', 'a1'), section('a', 'a2'), section('b', 'b1')]);
    expect(log.indexOf('a1:end')).toBeLessThan(log.indexOf('a2:start'));
    expect(log.indexOf('b1:start')).toBeLessThan(log.indexOf('a1:end'));
  });

  it('is re-entrant inside the same async context', async () => {
    const result = await withLock('k', () => withLock('k', async () => 'inner'));
    expect(result).toBe('inner');
  });

  it('releases the lock when the section throws', async () => {
    await expect(withLock('k', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await withLock('k', async () => 'ok')).toBe('ok');
  });
});

describe('catalogue mutations under the lock', () => {
  it('does not lose concurrent pool writes', async () => {
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => mutatePool((ps) => [...ps, promo(id)])));
    expect((await readPool()).map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('does not lose concurrent queue writes', async () => {
    await Promise.all(['a', 'b', 'c'].map((id) => mutateQueue('home', (q) => ({ ...q, ids: [...q.ids, id] }))));
    expect((await readQueue('home')).ids.sort()).toEqual(['a', 'b', 'c']);
  });
});
