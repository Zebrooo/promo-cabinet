# Редизайн «Расширенных настроек» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить disclosure «Расширенные настройки» на видимую секцию «Основное», объединённую секцию «Показы и лимиты» и секцию «Таргетинг» с подключаемыми фильтрами.

**Architecture:** Вся логика фильтров описывается декларативным реестром (`targeting/registry.ts`) — чистый модуль без React, покрытый юнит-тестами: для каждого фильтра известны его Formik-пути, признак активности, человекочитаемая сводка и группа каталога. UI (`FilterCard`, `FilterCatalog`, переписанный `TargetingSection`) читает реестр и не знает про конкретные поля. Схема `Promo`, `toPersisted`, `validate` и API не меняются.

**Tech Stack:** Next.js 14 (app router), React 18, Formik 2, zod 3, vitest 3 (node-окружение, без testing-library — тестируем чистую логику реестра, UI проверяем в браузере).

## Global Constraints

- Репозиторий: `/Users/dmitrii/projects/_services/promo-cabinet`, ветка `feat/advanced-settings-redesign` (создана от свежего `origin/main`). Ни коммита, ни пуша в `main`.
- Формат хранимых данных не меняется: никаких правок в `src/lib/schema.ts`, `to-persisted.ts`, `validate.ts` и API-роутах. Существующие тесты `to-persisted.test.ts`, `validate.test.ts`, `submit-touched.test.ts` должны продолжать проходить без изменений.
- Стили — только через `EDITOR_CSS` в `src/components/promo-form/editor-styles.ts` (в проекте нет CSS-модулей для редактора); существующие классы `ef-*` переиспользуем, новые именуем `ef-flt-*`.
- Тексты интерфейса — на русском, в тон существующим («Пусто — любая ОС»).
- Команды проверки: `pnpm test`, `pnpm typecheck`, `pnpm build`.
- Каждая задача заканчивается коммитом; сообщения в стиле истории репозитория (`feat(form): …`, `refactor(form): …`).

---

## Структура файлов

Создаются:

- `src/components/promo-form/targeting/registry.ts` — типы `FilterDescriptor`/`FilterGroup`, массив `FILTERS`, хелперы `clearFilter`, `flattenErrorPaths`, `filterIdsWithErrors`, `visibleFilterIds`.
- `src/components/promo-form/targeting/registry.test.ts` — юнит-тесты реестра.
- `src/components/promo-form/targeting/editors.tsx` — по компоненту-редактору на фильтр (перенос JSX из нынешнего `TargetingSection`).
- `src/components/promo-form/targeting/FilterCard.tsx` — карточка фильтра (свёрнутая сводка ↔ развёрнутый редактор).
- `src/components/promo-form/targeting/FilterCatalog.tsx` — панель «+ Добавить фильтр» с поиском и группами.
- `src/components/promo-form/sections/BasicsSection.tsx` — ID, название, даты показа (переезд из `ScheduleSection`).

Изменяются:

- `src/components/promo-form/sections/TargetingSection.tsx` — переписывается на композицию реестра и карточек.
- `src/components/promo-form/sections/FrequencySection.tsx` — вбирает поля лимитов, становится секцией «Показы и лимиты».
- `src/components/promo-form/PromoForm.tsx` — убирается disclosure, перевешиваются секции.
- `src/components/promo-form/editor-styles.ts` — удаляются `.ef-advanced*`, добавляются `.ef-flt-*`.

Удаляется:

- `src/components/promo-form/sections/ScheduleSection.tsx` (содержимое переехало в `BasicsSection.tsx`).

---

### Task 1: Реестр фильтров (чистая логика + тесты)

**Files:**
- Create: `src/components/promo-form/targeting/registry.ts`
- Test: `src/components/promo-form/targeting/registry.test.ts`

**Interfaces:**
- Consumes: `Promo` из `@/lib/schema`; `FormikErrors` из `formik`.
- Produces:
  - `type FilterGroup = 'audience' | 'behavior' | 'money' | 'device' | 'context'`
  - `const GROUP_LABELS: Record<FilterGroup, string>`
  - `const GROUP_ORDER: readonly FilterGroup[]`
  - `type FilterDescriptor = { id: string; label: string; group: FilterGroup; paths: readonly string[]; cleared?: Record<string, unknown>; isActive: (v: Promo) => boolean; summary: (v: Promo) => string }`
  - `const FILTERS: readonly FilterDescriptor[]`
  - `function findFilter(id: string): FilterDescriptor | undefined`
  - `function clearFilter(f: FilterDescriptor, setFieldValue: (path: string, value: unknown) => void): void`
  - `function flattenErrorPaths(errors: unknown): string[]`
  - `function filterIdsWithErrors(errors: unknown): string[]`
  - `function visibleFilterIds(values: Promo, extraIds: readonly string[]): string[]`

- [ ] **Step 1: Написать падающий тест**

Создать `src/components/promo-form/targeting/registry.test.ts`:

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && pnpm vitest run src/components/promo-form/targeting/registry.test.ts
```

Ожидаем: FAIL — `Failed to resolve import "./registry"`.

- [ ] **Step 3: Написать реестр**

Создать `src/components/promo-form/targeting/registry.ts`:

```ts
// Декларативный реестр фильтров таргетинга. UI (карточки, каталог) читает
// только его: список полей, признак активности, сводку для свёрнутой карточки
// и пути для очистки/сопоставления ошибок валидации. Формат хранимых данных
// не меняется — это описание уже существующих полей Promo.
import type { Promo } from '@/lib/schema';

export type FilterGroup = 'audience' | 'behavior' | 'money' | 'device' | 'context';

export const GROUP_ORDER = ['audience', 'behavior', 'money', 'device', 'context'] as const;

export const GROUP_LABELS: Record<FilterGroup, string> = {
  audience: 'Аудитория',
  behavior: 'Поведение',
  money: 'Деньги',
  device: 'Устройство и среда',
  context: 'Контекст страницы',
};

export type FilterDescriptor = {
  id: string;
  label: string;
  group: FilterGroup;
  /** Formik-пути фильтра: по ним чистим значения и ловим ошибки валидации. */
  paths: readonly string[];
  /** Во что сбрасывать путь при удалении. По умолчанию — undefined. */
  cleared?: Record<string, unknown>;
  isActive: (v: Promo) => boolean;
  summary: (v: Promo) => string;
};

const rub = (kopecks: number) => `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;
const list = (items?: readonly string[]) => (items ?? []).join(', ');

const AUDIENCE_LABELS: Record<string, string> = {
  authenticated: 'только залогиненные',
  anonymous: 'только гости',
};
const SELLER_LABELS: Record<string, string> = {
  seller: 'продавцам',
  buyer: 'покупателям',
};

export const FILTERS: readonly FilterDescriptor[] = [
  {
    id: 'age',
    label: 'Возраст',
    group: 'audience',
    paths: ['targeting.minAge', 'targeting.maxAge'],
    isActive: (v) => v.targeting.minAge !== undefined || v.targeting.maxAge !== undefined,
    summary: (v) => {
      const { minAge, maxAge } = v.targeting;
      if (minAge !== undefined && maxAge !== undefined) return `от ${minAge} до ${maxAge}`;
      if (minAge !== undefined) return `от ${minAge}`;
      return `до ${maxAge}`;
    },
  },
  {
    id: 'regions',
    label: 'Регионы',
    group: 'audience',
    paths: ['targeting.regions'],
    isActive: (v) => Boolean(v.targeting.regions?.length),
    summary: (v) => list(v.targeting.regions),
  },
  {
    id: 'subscription',
    label: 'Уровень подписки',
    group: 'audience',
    paths: ['targeting.subscriptionLevels'],
    isActive: (v) => Boolean(v.targeting.subscriptionLevels?.length),
    summary: (v) => list(v.targeting.subscriptionLevels),
  },
  {
    id: 'audience',
    label: 'Гости и залогиненные',
    group: 'audience',
    paths: ['audience'],
    cleared: { audience: 'all' },
    isActive: (v) => Boolean(v.audience) && v.audience !== 'all',
    summary: (v) => AUDIENCE_LABELS[v.audience ?? ''] ?? '',
  },
  {
    id: 'sellerStatus',
    label: 'Продавцы и покупатели',
    group: 'audience',
    paths: ['sellerStatus'],
    isActive: (v) => Boolean(v.sellerStatus),
    summary: (v) => SELLER_LABELS[v.sellerStatus ?? ''] ?? '',
  },
  {
    id: 'search',
    label: 'Поиск',
    group: 'behavior',
    paths: ['targeting.search'],
    isActive: (v) => Boolean(v.targeting.search?.terms?.length || v.targeting.search?.sections?.length),
    summary: (v) => {
      const s = v.targeting.search;
      const parts = [list(s?.terms), list(s?.sections)].filter(Boolean);
      return `${parts.join(' · ')} за ${s?.lookbackDays ?? 30} дн.`;
    },
  },
  {
    id: 'purchases',
    label: 'Покупки пакетов',
    group: 'behavior',
    paths: ['targeting.purchases'],
    isActive: (v) => {
      const p = v.targeting.purchases;
      return p?.purchased !== undefined || Boolean(p?.packTypes?.length)
        || p?.minTotalKopecks !== undefined || p?.minCount !== undefined;
    },
    summary: (v) => {
      const p = v.targeting.purchases;
      const parts: string[] = [];
      if (p?.purchased === true) parts.push('были покупки');
      if (p?.purchased === false) parts.push('не было покупок');
      if (p?.packTypes?.length) parts.push(list(p.packTypes));
      if (p?.minTotalKopecks !== undefined) parts.push(`от ${rub(p.minTotalKopecks)}`);
      if (p?.minCount !== undefined) parts.push(`от ${p.minCount} шт.`);
      return `${parts.join(' · ')} за ${p?.lookbackDays ?? 30} дн.`;
    },
  },
  {
    id: 'listings',
    label: 'Объявления продавца',
    group: 'behavior',
    paths: ['targeting.listings'],
    isActive: (v) => {
      const l = v.targeting.listings;
      return Boolean(l?.categories?.length || l?.activeCategories?.length
        || l?.hasUnpromotedActive || l?.inactiveDays !== undefined);
    },
    summary: (v) => {
      const l = v.targeting.listings;
      const parts: string[] = [];
      if (l?.categories?.length) parts.push(`размещал: ${list(l.categories)}`);
      if (l?.activeCategories?.length) parts.push(`активно: ${list(l.activeCategories)}`);
      if (l?.hasUnpromotedActive) parts.push('есть без продвижения');
      if (l?.inactiveDays !== undefined) parts.push(`не размещал ≥ ${l.inactiveDays} дн.`);
      return parts.join(' · ');
    },
  },
  {
    id: 'balance',
    label: 'Кошелёк',
    group: 'money',
    paths: ['targeting.balance'],
    isActive: (v) => {
      const b = v.targeting.balance;
      return b?.currentAbove !== undefined || b?.currentBelow !== undefined
        || b?.movementAbove !== undefined || b?.movementBelow !== undefined;
    },
    summary: (v) => {
      const b = v.targeting.balance;
      const parts: string[] = [];
      if (b?.currentAbove !== undefined) parts.push(`остаток от ${rub(b.currentAbove)}`);
      if (b?.currentBelow !== undefined) parts.push(`остаток до ${rub(b.currentBelow)}`);
      if (b?.movementAbove !== undefined) parts.push(`движение от ${rub(b.movementAbove)}`);
      if (b?.movementBelow !== undefined) parts.push(`движение до ${rub(b.movementBelow)}`);
      if (b?.movementLookbackDays !== undefined) parts.push(`окно ${b.movementLookbackDays} дн.`);
      return parts.join(' · ');
    },
  },
  {
    id: 'os',
    label: 'Операционная система',
    group: 'device',
    paths: ['targeting.os'],
    isActive: (v) => Boolean(v.targeting.os?.length),
    summary: (v) => list(v.targeting.os),
  },
  {
    id: 'environments',
    label: 'Среда',
    group: 'device',
    paths: ['targeting.environments'],
    isActive: (v) => Boolean(v.targeting.environments?.length),
    summary: (v) => list(v.targeting.environments),
  },
  {
    id: 'deviceBrands',
    label: 'Класс устройства',
    group: 'device',
    paths: ['targeting.deviceBrands'],
    isActive: (v) => Boolean(v.targeting.deviceBrands?.length),
    summary: (v) => list(v.targeting.deviceBrands),
  },
  {
    id: 'sections',
    label: 'Разделы',
    group: 'context',
    paths: ['sections'],
    isActive: (v) => Boolean(v.sections?.length),
    summary: (v) => list(v.sections),
  },
  {
    id: 'categories',
    label: 'Категории',
    group: 'context',
    paths: ['categories'],
    isActive: (v) => Boolean(v.categories?.length),
    summary: (v) => list(v.categories),
  },
] as const;

export function findFilter(id: string): FilterDescriptor | undefined {
  return FILTERS.find((f) => f.id === id);
}

/** Удаление карточки: каждый путь фильтра сбрасывается (по умолчанию в
 *  undefined, но, например, audience возвращается в 'all'). */
export function clearFilter(
  f: FilterDescriptor,
  setFieldValue: (path: string, value: unknown) => void,
): void {
  for (const path of f.paths) setFieldValue(path, f.cleared?.[path]);
}

/** FormikErrors — дерево строк; разворачиваем в плоские пути 'a.b.c'. */
export function flattenErrorPaths(errors: unknown, prefix = ''): string[] {
  if (!errors || typeof errors !== 'object') return prefix ? [prefix] : [];
  return Object.entries(errors as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : flattenErrorPaths(value, path);
  });
}

/** Фильтры, внутри которых есть ошибка — их карточки раскрываем при сабмите. */
export function filterIdsWithErrors(errors: unknown): string[] {
  const paths = flattenErrorPaths(errors);
  return FILTERS
    .filter((f) => f.paths.some((own) => paths.some((p) => p === own || p.startsWith(`${own}.`))))
    .map((f) => f.id);
}

/** Показываем активные фильтры плюс добавленные вручную, в порядке реестра. */
export function visibleFilterIds(values: Promo, extraIds: readonly string[]): string[] {
  return FILTERS
    .filter((f) => f.isActive(values) || extraIds.includes(f.id))
    .map((f) => f.id);
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && pnpm vitest run src/components/promo-form/targeting/registry.test.ts
```

Ожидаем: PASS, 11 тестов.

- [ ] **Step 5: Коммит**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet
git add src/components/promo-form/targeting/registry.ts src/components/promo-form/targeting/registry.test.ts
git commit -m "feat(form): реестр фильтров таргетинга"
```

---

### Task 2: Редакторы фильтров (перенос JSX)

**Files:**
- Create: `src/components/promo-form/targeting/editors.tsx`
- Modify: `src/components/promo-form/sections/TargetingSection.tsx` (источник JSX; переписывается в Task 4)

**Interfaces:**
- Consumes: `FILTERS` из `./registry` (только для сверки id); `SlugListField`, `FieldError` из `../fields`; `OS_OPTIONS`, `ENVIRONMENT_OPTIONS`, `DEVICE_BRAND_OPTIONS`, `OS_HINT`, `ENVIRONMENT_HINT`, `DEVICE_BRAND_HINT`, `toggleEnumValue` из `../env-targeting`.
- Produces: `const FILTER_EDITORS: Record<string, () => JSX.Element>` — по ключу `FilterDescriptor.id` возвращает компонент полей этого фильтра.

- [ ] **Step 1: Создать файл редакторов**

Создать `src/components/promo-form/targeting/editors.tsx`. Каждый редактор — это ровно тот JSX, что сейчас лежит в `TargetingSection.tsx`, вырезанный по фильтрам, вместе с хинтами и ограничениями:

- `age` — два `<div className="ef-field">` c `targeting.minAge`/`targeting.maxAge` (строки 84–107 текущего `TargetingSection.tsx`), обёрнутые в `<div className="ef-row">`.
- `regions` — `SlugListField name="targeting.regions"` (строки 108–111).
- `subscription` — чекбоксы `none/plus/premium` с `disabled` на premium, `title`-подсказками и хинтом про гостей (строки 114–147). Подсказки, которые сейчас живут в атрибуте `title`, дополнительно вывести видимым `<span className="ef-hint">` под группой: для premium — «Не поддерживается биллингом (billing-service отдаёт только plus/none)».
- `audience` — `<select>` по `values.audience` (строки 460–473).
- `sellerStatus` — `<select>` «Всем / Продавцам / Покупателям» (строки 378–391).
- `search` — четыре поля (`SearchListInput` × 2, «Период», «Совпадение») + хинт (строки 150–211). Компонент `SearchListInput` перенести в этот же файл без изменений (строки 18–53 текущего файла), вместе с `parseCommaList`.
- `purchases` — пять полей + хинт (строки 214–294).
- `listings` — три поля категорий, чекбокс `hasUnpromotedActive`, `inactiveDays` + хинт (строки 396–458).
- `balance` — пять полей + хинт (строки 297–364).
- `os` / `environments` / `deviceBrands` — три группы чекбоксов со своими хинтами (строки 478–533).
- `sections` — `SlugListField name="sections"` + хинт про overlay-only (строки 367–373).
- `categories` — `SlugListField name="categories"` (строки 374–377).

Каждый редактор — именованная функция (например `function AgeEditor() { … }`), внизу файла — карта:

```tsx
export const FILTER_EDITORS: Record<string, () => JSX.Element> = {
  age: AgeEditor,
  regions: RegionsEditor,
  subscription: SubscriptionEditor,
  audience: AudienceEditor,
  sellerStatus: SellerStatusEditor,
  search: SearchEditor,
  purchases: PurchasesEditor,
  listings: ListingsEditor,
  balance: BalanceEditor,
  os: OsEditor,
  environments: EnvironmentsEditor,
  deviceBrands: DeviceBrandsEditor,
  sections: SectionsEditor,
  categories: CategoriesEditor,
};
```

Файл начинается с `'use client';` — редакторы используют `useFormikContext`.

- [ ] **Step 2: Дописать тест, что реестр и редакторы не разъехались**

Добавить в конец `src/components/promo-form/targeting/registry.test.ts`:

```ts
describe('редакторы', () => {
  it('есть ровно у каждого фильтра реестра', async () => {
    const { FILTER_EDITORS } = await import('./editors');
    expect(Object.keys(FILTER_EDITORS).sort()).toEqual(FILTERS.map((f) => f.id).sort());
  });
});
```

- [ ] **Step 3: Запустить тесты**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && pnpm vitest run src/components/promo-form/targeting/registry.test.ts && pnpm typecheck
```

Ожидаем: PASS + typecheck без ошибок.

- [ ] **Step 4: Коммит**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet
git add src/components/promo-form/targeting/editors.tsx src/components/promo-form/targeting/registry.test.ts
git commit -m "refactor(form): редакторы фильтров таргетинга отдельным модулем"
```

---

### Task 3: Карточка фильтра, каталог и стили

**Files:**
- Create: `src/components/promo-form/targeting/FilterCard.tsx`
- Create: `src/components/promo-form/targeting/FilterCatalog.tsx`
- Modify: `src/components/promo-form/editor-styles.ts`

**Interfaces:**
- Consumes: `FilterDescriptor`, `FILTERS`, `GROUP_LABELS`, `GROUP_ORDER` из `./registry`; `FILTER_EDITORS` из `./editors`.
- Produces:
  - `function FilterCard(props: { filter: FilterDescriptor; summary: string; expanded: boolean; onToggle: () => void; onRemove: () => void }): JSX.Element`
  - `function FilterCatalog(props: { addedIds: readonly string[]; onPick: (id: string) => void }): JSX.Element`

- [ ] **Step 1: Написать `FilterCard.tsx`**

```tsx
'use client';
import { FILTER_EDITORS } from './editors';
import type { FilterDescriptor } from './registry';

/** Свёрнутая карточка — название + сводка значений; развёрнутая — редактор
 *  фильтра на месте, без модалок. */
export function FilterCard({
  filter, summary, expanded, onToggle, onRemove,
}: {
  filter: FilterDescriptor;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const Editor = FILTER_EDITORS[filter.id];
  return (
    <div className={`ef-flt-card${expanded ? ' is-open' : ''}`}>
      <div className="ef-flt-head">
        <button
          type="button"
          className="ef-flt-title"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="ef-flt-name">{filter.label}</span>
          {!expanded && summary && <span className="ef-flt-summary">{summary}</span>}
        </button>
        <button
          type="button"
          className="ef-flt-remove"
          onClick={onRemove}
          aria-label={`Убрать фильтр «${filter.label}»`}
          title="Убрать фильтр"
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="ef-flt-body">
          <Editor />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Написать `FilterCatalog.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { FILTERS, GROUP_LABELS, GROUP_ORDER } from './registry';

/** Панель «+ Добавить фильтр»: поиск по названию + группы. Уже добавленные
 *  фильтры показываются задизейбленными, чтобы не плодить дубли карточек. */
export function FilterCatalog({
  addedIds, onPick,
}: {
  addedIds: readonly string[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const matched = FILTERS.filter((f) => !needle || f.label.toLowerCase().includes(needle));

  if (!open) {
    return (
      <button type="button" className="ef-flt-add" onClick={() => setOpen(true)}>
        + Добавить фильтр
      </button>
    );
  }

  return (
    <div className="ef-flt-catalog">
      <div className="ef-flt-catalog-head">
        <input
          className="ef-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти фильтр…"
        />
        <button
          type="button"
          className="ef-flt-remove"
          onClick={() => { setOpen(false); setQuery(''); }}
          aria-label="Закрыть каталог фильтров"
        >
          ✕
        </button>
      </div>
      {GROUP_ORDER.map((group) => {
        const items = matched.filter((f) => f.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="ef-flt-group">
            <div className="ef-label">{GROUP_LABELS[group]}</div>
            {items.map((f) => {
              const added = addedIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="ef-flt-option"
                  disabled={added}
                  onClick={() => { onPick(f.id); setOpen(false); setQuery(''); }}
                >
                  {f.label}
                  {added && <span className="ef-flt-added">уже добавлен</span>}
                </button>
              );
            })}
          </div>
        );
      })}
      {matched.length === 0 && <div className="ef-hint">Ничего не найдено</div>}
    </div>
  );
}
```

- [ ] **Step 3: Добавить стили**

В `src/components/promo-form/editor-styles.ts` заменить блок `/* Advanced disclosure */` (строки 248–267, классы `.ef-advanced`, `.ef-advanced-toggle`, `.ef-advanced-toggle:hover`, `.ef-advanced-chev`, `.ef-advanced-body`) на:

```css
/* Targeting filters */
.ef-flt-list { display: flex; flex-direction: column; gap: 10px; }
.ef-flt-card {
  border: 1px solid var(--app-border); border-radius: 12px;
  background: var(--app-bg); overflow: hidden;
}
.ef-flt-card.is-open { border-color: var(--app-border2); }
.ef-flt-head { display: flex; align-items: center; }
.ef-flt-title {
  flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px;
  padding: 12px 14px; background: none; border: 0; cursor: pointer;
  font-family: inherit; text-align: left;
}
.ef-flt-title:hover { background: var(--app-surface2); }
.ef-flt-name { font-size: 13px; font-weight: 600; color: var(--app-fg1); }
.ef-flt-summary {
  font-size: 12px; color: var(--app-fg3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ef-flt-remove {
  background: none; border: 0; cursor: pointer;
  padding: 12px 14px; font-size: 13px; color: var(--app-fg4);
}
.ef-flt-remove:hover { color: var(--app-fg1); }
.ef-flt-body {
  padding: 4px 14px 16px;
  display: flex; flex-direction: column; gap: 14px;
}
.ef-flt-add {
  align-self: flex-start;
  padding: 10px 14px; border-radius: 10px;
  border: 1px dashed var(--app-border2); background: none;
  font-family: inherit; font-size: 13px; font-weight: 600; color: var(--app-fg2);
  cursor: pointer;
}
.ef-flt-add:hover { background: var(--app-surface2); color: var(--app-fg1); }
.ef-flt-catalog {
  border: 1px solid var(--app-border2); border-radius: 12px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 12px;
  background: var(--app-bg);
}
.ef-flt-catalog-head { display: flex; align-items: center; gap: 6px; }
.ef-flt-catalog-head .ef-input { flex: 1; height: 36px; font-size: 13px; }
.ef-flt-group { display: flex; flex-direction: column; gap: 2px; }
.ef-flt-option {
  display: flex; align-items: baseline; gap: 8px;
  padding: 7px 8px; border: 0; border-radius: 8px; background: none;
  font-family: inherit; font-size: 13px; color: var(--app-fg1);
  text-align: left; cursor: pointer;
}
.ef-flt-option:hover:not(:disabled) { background: var(--app-surface2); }
.ef-flt-option:disabled { color: var(--app-fg4); cursor: not-allowed; }
.ef-flt-added { font-size: 11px; color: var(--app-fg4); }
.ef-flt-empty { font-size: 13px; color: var(--app-fg3); }
```

- [ ] **Step 4: Проверить, что стилевой тест и типы в порядке**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && pnpm test && pnpm typecheck
```

Ожидаем: PASS (в том числе `editor-styles.test.ts`, который проверяет геометрию sticky-бара и не завязан на удалённые классы).

- [ ] **Step 5: Коммит**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet
git add src/components/promo-form/targeting/FilterCard.tsx src/components/promo-form/targeting/FilterCatalog.tsx src/components/promo-form/editor-styles.ts
git commit -m "feat(form): карточка фильтра и каталог таргетинга"
```

---

### Task 4: Секция «Таргетинг» на подключаемых фильтрах

**Files:**
- Modify: `src/components/promo-form/sections/TargetingSection.tsx` (полная замена содержимого)

**Interfaces:**
- Consumes: `visibleFilterIds`, `findFilter`, `filterIdsWithErrors`, `clearFilter` из `../targeting/registry`; `FilterCard`, `FilterCatalog`.
- Produces: `function TargetingSection(): JSX.Element` — секция целиком, включая заголовок «ТАРГЕТИНГ» (раньше заголовка не было, секция жила внутри disclosure).

- [ ] **Step 1: Переписать секцию**

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { FilterCard } from '../targeting/FilterCard';
import { FilterCatalog } from '../targeting/FilterCatalog';
import { clearFilter, filterIdsWithErrors, findFilter, visibleFilterIds } from '../targeting/registry';

/** Таргетинг как набор подключаемых фильтров: видны только включённые,
 *  остальные добавляются из каталога. Пусто = промо показывается всем. */
export function TargetingSection() {
  const { values, errors, submitCount, setFieldValue } = useFormikContext<Promo>();

  // Фильтры, добавленные в этой сессии, но ещё пустые: по значениям их не
  // отличить от невыбранных, поэтому держим отдельным UI-состоянием.
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const visible = useMemo(() => visibleFilterIds(values, extraIds), [values, extraIds]);

  // Ошибка внутри свёрнутой карточки не видна — раскрываем её на сабмите.
  useEffect(() => {
    if (submitCount === 0) return;
    const broken = filterIdsWithErrors(errors);
    if (broken.length === 0) return;
    setExpandedIds((cur) => [...new Set([...cur, ...broken])]);
  }, [submitCount, errors]);

  function addFilter(id: string) {
    setExtraIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    setExpandedIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }

  function removeFilter(id: string) {
    const filter = findFilter(id);
    if (filter) clearFilter(filter, setFieldValue);
    setExtraIds((cur) => cur.filter((x) => x !== id));
    setExpandedIds((cur) => cur.filter((x) => x !== id));
  }

  return (
    <section className="ef-block">
      <div className="ef-label">ТАРГЕТИНГ</div>
      {visible.length > 0 && (
        <div className="ef-flt-list">
          {visible.map((id) => {
            const filter = findFilter(id);
            if (!filter) return null;
            return (
              <FilterCard
                key={id}
                filter={filter}
                summary={filter.isActive(values) ? filter.summary(values) : 'не заполнен'}
                expanded={expandedIds.includes(id)}
                onToggle={() =>
                  setExpandedIds((cur) =>
                    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
                }
                onRemove={() => removeFilter(id)}
              />
            );
          })}
        </div>
      )}
      <FilterCatalog addedIds={visible} onPick={addFilter} />
      {visible.length === 0 && (
        <div className="ef-flt-empty">Фильтров нет — промо показывается всем.</div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Проверить типы и тесты**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && pnpm typecheck && pnpm test
```

Ожидаем: обе команды зелёные.

- [ ] **Step 3: Коммит**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet
git add src/components/promo-form/sections/TargetingSection.tsx
git commit -m "feat(form): таргетинг — подключаемые фильтры вместо простыни полей"
```

---

### Task 5: «Основное», «Показы и лимиты», снос disclosure

**Files:**
- Create: `src/components/promo-form/sections/BasicsSection.tsx`
- Delete: `src/components/promo-form/sections/ScheduleSection.tsx`
- Modify: `src/components/promo-form/sections/FrequencySection.tsx`
- Modify: `src/components/promo-form/PromoForm.tsx:34-40,129,339-371` (импорты, `advancedOpen`, разметка)

**Interfaces:**
- Consumes: `FieldError` из `../fields`.
- Produces:
  - `function BasicsSection(props: { mode: 'create' | 'edit' }): JSX.Element` — секция «ОСНОВНОЕ» с id/name/startsAt/endsAt.
  - `function FrequencySection(props: { poolPromos: { id: string; title: string }[] }): JSX.Element` — секция «ПОКАЗЫ И ЛИМИТЫ» (цепочка + лимит показов + кулдаун). Экспорт `FrequencyCapFields` удаляется.

- [ ] **Step 1: Создать `BasicsSection.tsx`**

Скопировать содержимое `ScheduleSection.tsx` целиком, переименовать компонент в `BasicsSection`, обернуть возвращаемый фрагмент в секцию с заголовком:

```tsx
return (
  <section className="ef-block">
    <div className="ef-label">ОСНОВНОЕ</div>
    <div className="ef-row">{/* ID (slug) + Внутреннее название — как в ScheduleSection */}</div>
    <div className="ef-row">{/* Начало показа + Окончание показа — как в ScheduleSection */}</div>
  </section>
);
```

Хелперы `isoToLocalInput`/`localInputToIso` переезжают вместе с компонентом без изменений. Комментарий в шапке обновить: секция больше не живёт внутри disclosure.

- [ ] **Step 2: Удалить `ScheduleSection.tsx`**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && git rm src/components/promo-form/sections/ScheduleSection.tsx
```

- [ ] **Step 3: Слить лимиты во `FrequencySection`**

В `src/components/promo-form/sections/FrequencySection.tsx`: удалить `export` у `FrequencyCapFields` и встроить её разметку в `FrequencySection` — после блока цепочки. Заголовок секции сменить с `ЦЕПОЧКА ПОКАЗОВ` на `ПОКАЗЫ И ЛИМИТЫ`. Итоговый порядок внутри секции: чекбокс цепочки (+ input и datalist, когда включён), затем `<div className="ef-row">` с «Лимит показов на пользователя» и «Кулдаун (часов)».

- [ ] **Step 4: Перевесить секции в `PromoForm.tsx`**

- В импортах (строки 34–40): убрать `ScheduleSection`, `TargetingSection` оставить, `FrequencySection` импортировать без `FrequencyCapFields`, добавить `BasicsSection`.
- Удалить состояние `const [advancedOpen, setAdvancedOpen] = useState(false);` (строка 129).
- Заменить блок разметки (строки 339–371) на:

```tsx
<div className="editor-main">
  <DevicePlacementSection mode={mode} />
  <BasicsSection mode={mode} />
  <ContentSection />

  <QueuesSection
    mode={mode}
    promoId={values.id}
    queueNames={queueNames}
    membership={membership}
  />

  <FrequencySection poolPromos={poolPromos} />
  <TargetingSection />

  {error && <div className="ef-error">{error}</div>}
</div>
```

- Обновить ASCII-схему в шапке файла (строки 14–20): вместо строки `│ Расширенные настройки ▾` перечислить `ОСНОВНОЕ`, `ПОКАЗЫ И ЛИМИТЫ`, `ТАРГЕТИНГ`.

- [ ] **Step 5: Проверить, что ссылок на удалённое не осталось**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && grep -rn "ScheduleSection\|FrequencyCapFields\|ef-advanced\|advancedOpen" src/ ; pnpm typecheck && pnpm test
```

Ожидаем: grep ничего не находит, typecheck и тесты зелёные.

- [ ] **Step 6: Коммит**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet
git add -A src/components/promo-form
git commit -m "feat(form): секции «Основное» и «Показы и лимиты» вместо расширенных настроек"
```

---

### Task 6: Проверка в браузере и PR

**Files:**
- Modify: по результатам проверки — только найденные дефекты.

- [ ] **Step 1: Полный прогон проверок**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet && pnpm test && pnpm typecheck && pnpm build
```

Ожидаем: все три зелёные.

- [ ] **Step 2: Поднять дев-сервер и открыть редактор промо**

Через `preview_start` (не через Bash). Если в `.claude/launch.json` нет записи — создать: `runtimeExecutable: "pnpm"`, `runtimeArgs: ["dev"]`, `port: 3000`. Открыть страницу создания промо (`/cabinet/new` или ссылку «Новое промо» из списка).

- [ ] **Step 3: Проверить сценарии вручную**

1. Секция «Таргетинг» пуста → видно «Фильтров нет — промо показывается всем».
2. «+ Добавить фильтр» → каталог с пятью группами; поиск по слову «кош» находит «Кошелёк».
3. Добавить «Возраст», заполнить 25/45, свернуть → в шапке карточки сводка «от 25 до 45».
4. «✕» на карточке → карточка исчезла, значения очищены (после повторного добавления поля пустые).
5. Открыть существующее промо с таргетингом → карточки построились из сохранённых значений.
6. Проверить консоль и сетевые запросы на ошибки: `read_console_messages`, `preview_logs`.

- [ ] **Step 4: Снять скриншот итога**

`computer {action: "screenshot"}` — секции «Основное», «Показы и лимиты», «Таргетинг» с парой добавленных фильтров.

- [ ] **Step 5: Пуш и PR**

```bash
cd /Users/dmitrii/projects/_services/promo-cabinet
git push -u origin HEAD
gh pr create --base main --head feat/advanced-settings-redesign \
  --title "feat(form): редизайн расширенных настроек — подключаемые фильтры" \
  --body "…"
```

Тело PR: что сделано (три секции вместо disclosure, реестр фильтров), зачем (простыня полей, не видно активные фильтры, рост до ~30 таргетингов), как проверять (шаги из Step 3 + `pnpm test`), риски (UI-перекомпоновка; формат данных и API не менялись).

---

## Самопроверка плана

- **Покрытие спеки:** секция «Основное» — Task 5; «Показы и лимиты» — Task 5; реестр фильтров с `id/label/group/isActive/summary/clear/Editor` — Tasks 1–2; каталог с поиском и группами, пометка «уже добавлен» — Task 3; поведение карточки (сводка, инлайн-редактирование, удаление с очисткой, новый фильтр развёрнут) — Tasks 3–4; сохранение хинтов и ограничений — Task 2; автораскрытие карточки с ошибкой — Tasks 1 и 4; неизменность схемы/API — Global Constraints; тесты реестра — Task 1.
- **Плейсхолдеры:** код приведён целиком для реестра, карточки, каталога и секции таргетинга; для Task 2 и Task 5 указаны точные строки-источники переносимого JSX.
- **Согласованность имён:** `FilterDescriptor.isActive/summary/paths/cleared`, `clearFilter`, `findFilter`, `visibleFilterIds`, `filterIdsWithErrors`, `FILTER_EDITORS`, `FilterCard`, `FilterCatalog`, `BasicsSection` — используются одинаково во всех задачах.
