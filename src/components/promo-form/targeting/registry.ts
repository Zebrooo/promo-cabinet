// Декларативный реестр фильтров таргетинга. UI (карточки, каталог) читает
// только его: список полей, признак активности, сводку для свёрнутой карточки
// и пути для очистки/сопоставления ошибок валидации. Формат хранимых данных
// не меняется — это описание уже существующих полей Promo.
import type { Promo } from '@/lib/schema';

export type FilterGroup = 'audience' | 'behavior' | 'money' | 'device' | 'context' | 'time';

export const GROUP_ORDER = ['audience', 'behavior', 'money', 'device', 'context', 'time'] as const;

export const GROUP_LABELS: Record<FilterGroup, string> = {
  audience: 'Аудитория',
  behavior: 'Поведение',
  money: 'Деньги',
  device: 'Устройство и среда',
  context: 'Контекст страницы',
  time: 'Время показа',
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
const GEO_SEGMENT_LABELS: Record<string, string> = {
  local: 'местные',
  tourist: 'туристы',
  other: 'другое',
};
const VISITOR_CLASS_LABELS: Record<string, string> = {
  newcomer: 'новички',
  regular: 'постоянные',
};
const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const fmtHour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
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
    id: 'geo',
    label: 'Гео по IP',
    group: 'audience',
    paths: ['targeting.geoSegments', 'targeting.geoCities'],
    isActive: (v) => Boolean(v.targeting.geoSegments?.length || v.targeting.geoCities?.length),
    summary: (v) => [
      (v.targeting.geoSegments ?? []).map((s) => GEO_SEGMENT_LABELS[s] ?? s).join(', '),
      list(v.targeting.geoCities),
    ].filter(Boolean).join(' · '),
  },
  {
    id: 'visitProfile',
    label: 'Профиль визита',
    group: 'audience',
    paths: ['targeting.visitorClass', 'targeting.newcomerMaxAgeDays', 'targeting.regularMinVisitDays'],
    isActive: (v) => Boolean(v.targeting.visitorClass),
    summary: (v) => {
      const cls = VISITOR_CLASS_LABELS[v.targeting.visitorClass ?? ''] ?? '';
      if (v.targeting.visitorClass === 'newcomer' && v.targeting.newcomerMaxAgeDays !== undefined) {
        return `${cls} — моложе ${v.targeting.newcomerMaxAgeDays} дн.`;
      }
      if (v.targeting.visitorClass === 'regular' && v.targeting.regularMinVisitDays !== undefined) {
        return `${cls} — от ${v.targeting.regularMinVisitDays} дн. с визитами`;
      }
      return cls;
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
    id: 'behavior',
    label: 'Поведение',
    group: 'behavior',
    paths: ['targeting.behavior'],
    isActive: (v) => {
      const b = v.targeting.behavior;
      return Boolean(b?.interest?.categories?.length)
        || b?.hotBuyer !== undefined || b?.minSessionViews !== undefined;
    },
    summary: (v) => {
      const b = v.targeting.behavior;
      const parts: string[] = [];
      if (b?.interest?.categories?.length) {
        parts.push(`смотрел ${list(b.interest.categories)} за ${b.interest.lookbackDays ?? 7} дн.`);
      }
      if (b?.hotBuyer !== undefined) {
        parts.push(`горячий покупатель (от ${b.hotBuyer.minPhoneViews ?? 2} телефонов)`);
      }
      if (b?.minSessionViews !== undefined) parts.push(`после ${b.minSessionViews} карточек за визит`);
      return parts.join(' · ');
    },
  },
  {
    id: 'lifecycle',
    label: 'Жизненный цикл продавца',
    group: 'behavior',
    paths: ['lifecycle'],
    isActive: (v) => {
      const l = v.lifecycle;
      return Boolean(l?.activeInCategories?.length) || l?.soldWithinDays !== undefined
        || l?.hasStalledActive === true || l?.firstListingWithinDays !== undefined;
    },
    summary: (v) => {
      const l = v.lifecycle;
      const parts: string[] = [];
      if (l?.activeInCategories?.length) parts.push(`продаёт: ${list(l.activeInCategories)}`);
      if (l?.soldWithinDays !== undefined) parts.push(`продал за ${l.soldWithinDays} дн.`);
      if (l?.hasStalledActive === true) parts.push('объявление зависло');
      if (l?.firstListingWithinDays !== undefined) parts.push(`первое объявление ≤ ${l.firstListingWithinDays} дн.`);
      return parts.join(' · ');
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
  {
    id: 'schedule',
    label: 'Расписание показов',
    group: 'time',
    paths: ['schedule'],
    // Отсутствие поля = круглосуточно без ограничений; карточка нужна только
    // когда расписание реально сужает показ (to-persisted нормализует полное
    // покрытие обратно в отсутствие поля).
    isActive: (v) => v.schedule !== undefined,
    summary: (v) => {
      const s = v.schedule;
      if (!s) return '';
      const days = s.daysOfWeek.length === 7
        ? 'все дни'
        : s.daysOfWeek.map((d) => DAY_LABELS[d - 1]).join(', ');
      const hours = s.hourStart === 0 && s.hourEnd === 24
        ? 'круглосуточно'
        : `${fmtHour(s.hourStart)}–${s.hourEnd === 24 ? '24:00' : fmtHour(s.hourEnd)}`;
      return `${days} · ${hours} МСК`;
    },
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

/** FormikErrors (дерево строк) и FormikTouched (дерево булей) — разворачиваем
 *  в плоские пути 'a.b.c'; ветки с пустым/false-листом отбрасываем. */
export function flattenErrorPaths(tree: unknown, prefix = ''): string[] {
  if (tree === null || tree === undefined) return [];
  if (typeof tree !== 'object') return tree && prefix ? [prefix] : [];
  return Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return flattenErrorPaths(value, path);
  });
}

/** Фильтры, внутри которых есть ошибка. Если передан touched, учитываются
 *  только показанные пользователю ошибки — те же, что рисует FieldError
 *  (сабмит с ошибкой помечает touched всё дерево ошибок). */
export function filterIdsWithErrors(errors: unknown, touched?: unknown): string[] {
  let paths = flattenErrorPaths(errors);
  if (touched !== undefined) {
    const touchedPaths = flattenErrorPaths(touched);
    paths = paths.filter((p) => touchedPaths.some((t) => t === p || p.startsWith(`${t}.`)));
  }
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
