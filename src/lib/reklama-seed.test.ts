import { describe, expect, it } from 'vitest';
import {
  CREATIVE_PLACEHOLDER, EXPECTED_IDS, SEED_QUEUES, creativeFileName, isGated, placeIds,
  referencedCreatives, rewriteCreativeUrls, upsertById,
} from './reklama-seed';

describe('reklama-seed', () => {
  it('план очередей: восемь промо, home в порядке s1b → s1 → s2 → s3', () => {
    expect(EXPECTED_IDS).toHaveLength(8);
    expect(new Set(EXPECTED_IDS).size).toBe(8);
    expect(SEED_QUEUES.find((q) => q.queue === 'home')?.ids)
      .toEqual(['s1b-budget-exhausted', 's1-popup-resume', 's2-popup-abandoned', 's3-multistep-home']);
  });

  it('s2 закрыт по умолчанию и открывается флагом', () => {
    expect(isGated('s2-popup-abandoned', false)).toBe(true);
    expect(isGated('s2-popup-abandoned', true)).toBe(false);
    expect(isGated('s1-popup-resume', false)).toBe(false);
  });

  it('находит и переписывает ссылки на заглушку во вложенных полях', () => {
    const promo = {
      id: 'x',
      imageUrl: `${CREATIVE_PLACEHOLDER}/a2.gif`,
      steps: [{ title: 't', body: 'b', imageUrl: `${CREATIVE_PLACEHOLDER}/d1.gif` }],
      description: 'без ссылок',
    };
    expect(referencedCreatives(promo).sort()).toEqual(['a2.gif', 'd1.gif']);
    const gif = rewriteCreativeUrls(promo, { base: 'https://promo.example/api/img/promo-uploads/reklama-2026-09/', kind: 'gif' });
    expect(gif.imageUrl).toBe('https://promo.example/api/img/promo-uploads/reklama-2026-09/a2.gif');
    expect(gif.steps[0].imageUrl).toBe('https://promo.example/api/img/promo-uploads/reklama-2026-09/d1.gif');
    expect(gif.description).toBe('без ссылок');
    const apng = rewriteCreativeUrls(promo, { base: 'https://cdn.example/promo-uploads/reklama-2026-09', kind: 'apng' });
    expect(apng.imageUrl).toBe('https://cdn.example/promo-uploads/reklama-2026-09/a2-anim.png');
    expect(creativeFileName('a2.gif', 'apng')).toBe('a2-anim.png');
    expect(creativeFileName('a2.gif', 'gif')).toBe('a2.gif');
  });

  it('placeIds ставит группу блоком, идемпотентно, не трогая чужие id', () => {
    expect(placeIds(['other-1', 's1-popup-resume', 'other-2'], ['s1b-budget-exhausted', 's1-popup-resume'], 'back'))
      .toEqual(['other-1', 'other-2', 's1b-budget-exhausted', 's1-popup-resume']);
    expect(placeIds(['other-1'], ['a', 'b'], 'front')).toEqual(['a', 'b', 'other-1']);
    const once = placeIds([], ['a', 'b'], 'front');
    expect(placeIds(once, ['a', 'b'], 'front')).toEqual(once);
  });

  it('upsertById заменяет по id и добавляет новые в конец', () => {
    const pool = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
    expect(upsertById(pool, [{ id: 'b', v: 2 }, { id: 'c', v: 1 }]))
      .toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 1 }]);
  });
});
