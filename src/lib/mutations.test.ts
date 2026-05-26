import { describe, expect, it } from 'vitest';
import {
  addPromo,
  updatePromo,
  removePromo,
  enqueue,
  dequeue,
  reorderQueue,
  DuplicateIdError,
  NotFoundError,
  ReorderMismatchError,
} from './mutations';
import type { Promo } from './schema';

const make = (id: string): Promo => ({
  id,
  name: id,
  startsAt: '2024-01-01T00:00:00.000Z',
  endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {},
  maxImpressionsPerUser: 0,
  cooldownHours: 0,
  format: 'inline',
  title: id,
});

describe('addPromo', () => {
  it('appends to the end of the queue', () => {
    const result = addPromo([make('a')], make('b'));
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('throws DuplicateIdError when the id already exists', () => {
    expect(() => addPromo([make('a')], make('a'))).toThrow(DuplicateIdError);
  });

  it('does not mutate the input array', () => {
    const input = [make('a')];
    addPromo(input, make('b'));
    expect(input).toHaveLength(1);
  });
});

describe('updatePromo', () => {
  it('replaces by id and preserves position', () => {
    const result = updatePromo([make('a'), make('b'), make('c')], 'b', { ...make('b'), title: 'New' });
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(result[1].title).toBe('New');
  });

  it('throws NotFoundError when the id is missing', () => {
    expect(() => updatePromo([make('a')], 'zzz', make('zzz'))).toThrow(NotFoundError);
  });
});

describe('removePromo', () => {
  it('removes by id', () => {
    const result = removePromo([make('a'), make('b')], 'a');
    expect(result.map((p) => p.id)).toEqual(['b']);
  });

  it('throws NotFoundError when the id is missing', () => {
    expect(() => removePromo([make('a')], 'zzz')).toThrow(NotFoundError);
  });
});

describe('queue ops', () => {
  it('enqueue appends when absent and is idempotent', () => {
    expect(enqueue(['a'], 'b')).toEqual(['a', 'b']);
    expect(enqueue(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });
  it('dequeue removes the id and is idempotent', () => {
    expect(dequeue(['a', 'b'], 'a')).toEqual(['b']);
    expect(dequeue(['b'], 'a')).toEqual(['b']);
  });
  it('reorderQueue accepts a permutation', () => {
    expect(reorderQueue(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });
  it('reorderQueue rejects a non-permutation', () => {
    expect(() => reorderQueue(['a', 'b'], ['a'])).toThrow(ReorderMismatchError);
    expect(() => reorderQueue(['a', 'b'], ['a', 'x'])).toThrow(ReorderMismatchError);
  });
});
