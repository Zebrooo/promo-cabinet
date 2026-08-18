import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import {
  FILTERS, GROUP_LABELS, GROUP_ORDER, clearFilter, filterIdsWithErrors,
  findFilter, flattenErrorPaths, visibleFilterIds,
} from './registry';

const base: Promo = {
  id: 'p1', name: 'promo', startsAt: '', endsAt: '', targeting: {},
  cooldownHours: 0, format: 'inline', title: 'T', audience: 'all', deviceTarget: 'both',
};

/** Значения, при которых фильтр заведомо активен — по одному на фильтр. */
const ACTIVE_SAMPLE: Record<string, Promo> = {
  age: { ...base, targeting: { minAge: 25, maxAge: 45 } },
  regions: { ...base, targeting: { regions: ['sukhum'] } },
  subscription: { ...base, targeting: { subscriptionLevels: ['plus'] } },
  audience: { ...base, audience: 'authenticated' },
  sellerStatus: { ...base, sellerStatus: 'seller' },
  search: { ...base, targeting: { search: { terms: ['toyota'], lookbackDays: 30 } } },
  purchases: { ...base, targeting: { purchases: { packTypes: ['vip'] } } },
  listings: { ...base, targeting: { listings: { activeCategories: ['avto'] } } },
  balance: { ...base, targeting: { balance: { currentAbove: 100000 } } },
  os: { ...base, targeting: { os: ['ios'] } },
  environments: { ...base, targeting: { environments: ['pwa'] } },
  deviceBrands: { ...base, targeting: { deviceBrands: ['iphone'] } },
  sections: { ...base, sections: ['avto'] },
  categories: { ...base, categories: ['kvartiry'] },
};

describe('реестр фильтров таргетинга', () => {
  it('покрывает каждый фильтр примером активных значений', () => {
    expect(Object.keys(ACTIVE_SAMPLE).sort()).toEqual(FILTERS.map((f) => f.id).sort());
  });

  it('у каждого фильтра уникальный id, непустая метка и известная группа', () => {
    const ids = FILTERS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FILTERS) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(GROUP_ORDER).toContain(f.group);
      expect(GROUP_LABELS[f.group]).toBeTruthy();
      expect(f.paths.length).toBeGreaterThan(0);
    }
  });

  it('на пустом промо неактивны все фильтры', () => {
    for (const f of FILTERS) expect(f.isActive(base), f.id).toBe(false);
  });

  it('активный фильтр даёт непустую сводку', () => {
    for (const f of FILTERS) {
      const values = ACTIVE_SAMPLE[f.id];
      expect(f.isActive(values), f.id).toBe(true);
      expect(f.summary(values).length, f.id).toBeGreaterThan(0);
    }
  });

  it('clearFilter сбрасывает пути так, что фильтр становится неактивным', () => {
    for (const f of FILTERS) {
      let values = ACTIVE_SAMPLE[f.id];
      clearFilter(f, (path, value) => { values = setPath(values, path, value); });
      expect(f.isActive(values), f.id).toBe(false);
    }
  });

  it('findFilter находит по id и молчит на неизвестном', () => {
    expect(findFilter('age')?.label).toBe('Возраст');
    expect(findFilter('nope')).toBeUndefined();
  });
});

describe('ошибки валидации → фильтры', () => {
  it('разворачивает вложенный объект ошибок в плоские пути', () => {
    expect(flattenErrorPaths({
      targeting: { minAge: 'плохо', search: { terms: 'плохо' } },
      title: 'плохо',
    }).sort()).toEqual(['targeting.minAge', 'targeting.search.terms', 'title'].sort());
  });

  it('сопоставляет путь ошибки с фильтром, включая вложенные пути', () => {
    expect(filterIdsWithErrors({ targeting: { search: { terms: 'плохо' } } })).toEqual(['search']);
    expect(filterIdsWithErrors({ targeting: { minAge: 'плохо' } })).toEqual(['age']);
  });

  it('игнорирует ошибки полей вне таргетинга', () => {
    expect(filterIdsWithErrors({ title: 'плохо', endsAt: 'плохо' })).toEqual([]);
  });
});

describe('видимые карточки', () => {
  it('показывает активные фильтры в порядке реестра', () => {
    const values: Promo = { ...base, targeting: { os: ['ios'], minAge: 20 } };
    expect(visibleFilterIds(values, [])).toEqual(['age', 'os']);
  });

  it('добавляет вручную выбранные пустые фильтры без дублей', () => {
    const values: Promo = { ...base, targeting: { minAge: 20 } };
    expect(visibleFilterIds(values, ['regions', 'age'])).toEqual(['age', 'regions']);
  });
});

/** Мини-помощник вместо formik/setIn — тест не тянет React-зависимости. */
function setPath(obj: Promo, path: string, value: unknown): Promo {
  const [head, ...rest] = path.split('.');
  const next: Record<string, unknown> = { ...(obj as unknown as Record<string, unknown>) };
  if (rest.length === 0) {
    next[head] = value;
  } else {
    const child = (next[head] ?? {}) as Record<string, unknown>;
    next[head] = setPath(child as unknown as Promo, rest.join('.'), value);
  }
  return next as unknown as Promo;
}
