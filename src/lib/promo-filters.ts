// Фильтры и сортировка каталога промо (страница «Все промо»).
//
// Чистая логика без React: декларативный реестр фасетов, состояние ↔ URL,
// отбор промо, фасетные счётчики. UI (PromoList) только рисует чипы и
// дёргает эти функции. Состояние живёт в URL, чтобы ссылку на выборку
// можно было скопировать коллеге, а «назад» возвращал прошлый фильтр.
//
// Конвенция та же, что в таргетинге: между фасетами — И, внутри фасета —
// ИЛИ (кроме «флагов», где выбранные признаки должны совпасть все).
import type { Promo, PromoFormat } from './schema';
import { promoFormats } from './schema';
import { FORMAT_LABEL } from './format-labels';
import { QUEUE_META } from './queue-formats';
import { KNOWN_CUSTOM_VARIANTS } from './custom-variants';
import { FILTERS as TARGETING_FILTERS } from '@/components/promo-form/targeting/registry';
import { OS_OPTIONS, ENVIRONMENT_OPTIONS, DEVICE_BRAND_OPTIONS } from '@/components/promo-form/env-targeting';

/* ───────────────────────── статус ───────────────────────── */

/** Схема требует startsAt/endsAt, невалидные промо readPool не отдаёт —
 *  поэтому «черновика» в каталоге не бывает, только три состояния окна. */
export type PromoStatus = 'active' | 'scheduled' | 'expired';

export const STATUS_ORDER: readonly PromoStatus[] = ['active', 'scheduled', 'expired'];

export const STATUS_LABEL: Record<PromoStatus, string> = {
  active: 'Активные',
  scheduled: 'Запланированные',
  expired: 'Архив',
};

/** Короткая метка для бейджа на карточке. */
export const STATUS_BADGE: Record<PromoStatus, string> = {
  active: 'АКТИВНО',
  scheduled: 'ЗАПЛАН.',
  expired: 'ИСТЕКЛО',
};

const time = (iso: string | undefined): number | null => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
};

export function promoStatus(p: Promo, now: number = Date.now()): PromoStatus {
  const start = time(p.startsAt);
  const end = time(p.endsAt);
  if (start !== null && now < start) return 'scheduled';
  if (end !== null && now > end) return 'expired';
  return 'active';
}

/** Сколько целых дней осталось до конца окна (отрицательное — уже истекло), null если даты нет. */
export function daysUntilEnd(p: Promo, now: number = Date.now()): number | null {
  const end = time(p.endsAt);
  return end === null ? null : Math.ceil((end - now) / 86_400_000);
}

export const ENDS_SOON_DAYS = 7;

/* ───────────────────────── контекст ───────────────────────── */

export type Membership = Record<string, string[] | undefined>;

export interface FacetContext {
  membership: Membership;
  queueNames: readonly string[];
  now: number;
  /** id промо, на которые кто-то ссылается через afterPromoId/afterClickPromoId. */
  chainTargets: ReadonlySet<string>;
  /** Все id пула — чтобы ловить «висящие» ссылки цепочки. */
  knownIds: ReadonlySet<string>;
}

export function buildFacetContext(
  promos: readonly Promo[],
  membership: Membership,
  queueNames: readonly string[],
  now: number = Date.now(),
): FacetContext {
  const chainTargets = new Set<string>();
  const knownIds = new Set<string>();
  for (const p of promos) {
    knownIds.add(p.id);
    if (p.afterPromoId) chainTargets.add(p.afterPromoId);
    if (p.afterClickPromoId) chainTargets.add(p.afterClickPromoId);
  }
  return { membership, queueNames, now, chainTargets, knownIds };
}

/* ───────────────────────── производные признаки ───────────────────────── */

export const NO_QUEUE = '__none__';
export const LEGACY_ONLY = '__legacy__';

export function isLegacyQueue(name: string): boolean {
  return QUEUE_META[name]?.legacy === true;
}

/** Очереди промо: живые первыми, легаси — в конце. */
export function promoQueues(p: Promo, ctx: FacetContext): string[] {
  const qs = ctx.membership[p.id] ?? [];
  return [...qs].sort((a, b) => Number(isLegacyQueue(a)) - Number(isLegacyQueue(b)) || a.localeCompare(b));
}

export function queueLabel(name: string): string {
  return QUEUE_META[name]?.label ?? name;
}

/** id активных фильтров таргетинга (реестр формы) — тот же источник, что и
 *  карточки расширенных настроек, чтобы подписи не разъезжались. */
export function activeTargetingIds(p: Promo): string[] {
  return TARGETING_FILTERS.filter((f) => f.isActive(p)).map((f) => f.id);
}

/** Человеческая сводка таргетинга — для title карточки. */
export function targetingSummary(p: Promo): string[] {
  return TARGETING_FILTERS.filter((f) => f.isActive(p)).map((f) => {
    const s = f.summary(p);
    return s ? `${f.label}: ${s}` : f.label;
  });
}

const IMAGE_FORMATS: ReadonlySet<PromoFormat> = new Set(['inline', 'promoline', 'popup', 'fullscreen', 'tooltip', 'multistep']);
const CTA_FORMATS: ReadonlySet<PromoFormat> = new Set(['inline', 'promoline', 'topline', 'popup', 'fullscreen', 'tooltip', 'multistep']);

export function hasImage(p: Promo): boolean {
  return Boolean(p.imageUrl || p.backgroundImage || p.steps?.some((s) => s.imageUrl));
}

/** Булевы признаки промо — ищем «что-то забыли» и «что-то зависит». */
export type PromoFlag =
  | 'endsSoon'     // активно и заканчивается в ближайшие 7 дней
  | 'noQueue'      // не стоит ни в одной очереди
  | 'legacyOnly'   // стоит только в очередях, которые витрина не запрашивает
  | 'noImage'      // формат умеет картинку, а её нет
  | 'noCta'        // формат умеет кнопку, а ссылки нет
  | 'noTargeting'  // ни одного условия таргетинга
  | 'lead'         // сбор лидов
  | 'chain'        // зависит от другого промо
  | 'chainParent'  // на него ссылаются другие промо
  | 'chainBroken'  // ссылается на несуществующее промо
  | 'suppress'     // гасится после клика
  | 'capped'       // лимит показов на юзера
  | 'dayparting';  // расписание по дням/часам

export const FLAG_ORDER: readonly PromoFlag[] = [
  'endsSoon', 'noQueue', 'legacyOnly', 'noImage', 'noCta', 'noTargeting', 'chainBroken',
  'lead', 'chain', 'chainParent', 'suppress', 'capped', 'dayparting',
];

export const FLAG_LABEL: Record<PromoFlag, string> = {
  endsSoon: 'Скоро закончится',
  noQueue: 'Не в очереди',
  legacyOnly: 'Очереди без потребителя',
  noImage: 'Без картинки',
  noCta: 'Без кнопки',
  noTargeting: 'Без таргетинга',
  chainBroken: 'Битая цепочка',
  lead: 'Сбор лидов',
  chain: 'Зависит от другого промо',
  chainParent: 'Есть зависимые',
  suppress: 'Гасится после клика',
  capped: 'Лимит показов',
  dayparting: 'Есть расписание',
};

/** Флаги, которые стоит показать как предупреждение на карточке. */
export const WARNING_FLAGS: readonly PromoFlag[] = ['noQueue', 'legacyOnly', 'chainBroken', 'noImage', 'noCta', 'endsSoon'];

export const WARNING_TEXT: Record<PromoFlag, string> = {
  ...FLAG_LABEL,
  noQueue: 'Промо не стоит ни в одной очереди — витрина его не покажет',
  legacyOnly: 'Промо стоит только в очередях, которые витрина не запрашивает, — показов не будет. Для каталога нужны очереди с суффиксом устройства («Транспорт · веб» и т. п.)',
  chainBroken: 'Цепочка ссылается на промо, которого нет в пуле',
  noImage: 'У формата есть картинка, но она не задана',
  noCta: 'У формата есть кнопка, но ссылка не задана',
  endsSoon: `Окно показа заканчивается в ближайшие ${ENDS_SOON_DAYS} дней`,
};

export function promoFlags(p: Promo, ctx: FacetContext): Set<PromoFlag> {
  const flags = new Set<PromoFlag>();
  const status = promoStatus(p, ctx.now);
  const left = daysUntilEnd(p, ctx.now);
  if (status === 'active' && left !== null && left <= ENDS_SOON_DAYS) flags.add('endsSoon');

  const qs = ctx.membership[p.id] ?? [];
  if (qs.length === 0) flags.add('noQueue');
  else if (qs.every(isLegacyQueue)) flags.add('legacyOnly');

  if (IMAGE_FORMATS.has(p.format) && !hasImage(p)) flags.add('noImage');
  if (CTA_FORMATS.has(p.format) && !p.action?.href) flags.add('noCta');
  if (activeTargetingIds(p).length === 0) flags.add('noTargeting');

  const parents = [p.afterPromoId, p.afterClickPromoId].filter((x): x is string => Boolean(x));
  if (parents.length) flags.add('chain');
  if (parents.some((id) => !ctx.knownIds.has(id))) flags.add('chainBroken');
  if (ctx.chainTargets.has(p.id)) flags.add('chainParent');

  if (p.leadCapture) flags.add('lead');
  if (p.suppressAfterClick) flags.add('suppress');
  if (p.maxImpressionsPerUser !== undefined) flags.add('capped');
  if (p.schedule !== undefined) flags.add('dayparting');
  return flags;
}

/* ───────────────────────── реестр фасетов ───────────────────────── */

export interface FacetOption {
  id: string;
  label: string;
  /** Группа в выпадающем списке (очереди: каталог / устройство / легаси). */
  group?: string;
}

export interface FacetDef {
  /** Имя URL-параметра. */
  id: string;
  label: string;
  /** Значения промо по этому фасету; пусто = ни одно значение не совпадёт. */
  values: (p: Promo, ctx: FacetContext) => readonly string[];
  /** Статичный список опций в порядке показа; нет — собираем из пула. */
  options?: (ctx: FacetContext) => readonly FacetOption[];
  /** Подпись для значения, которое пришло из данных (data-driven фасеты). */
  optionLabel?: (id: string) => string;
  /** 'any' (ИЛИ, по умолчанию) или 'all' (все выбранные должны совпасть). */
  mode?: 'any' | 'all';
  /** Условие, когда в фасете ничего не выбрано (статус: прячем архив). */
  defaultMatch?: (values: readonly string[]) => boolean;
  /** Основная строка чипов или панель «Ещё фильтры». */
  placement: 'primary' | 'more';
  /** Как рисовать в панели: чипы (мало опций) или выпадающий список (много). */
  control: 'chips' | 'select';
}

const opt = (id: string, label: string, group?: string): FacetOption => ({ id, label, group });

function queueOptions(ctx: FacetContext): FacetOption[] {
  const special = [opt(NO_QUEUE, 'Ни в одной очереди', 'Особые'), opt(LEGACY_ONLY, 'Только легаси', 'Особые')];
  const named = [...ctx.queueNames]
    .map((name) => {
      const meta = QUEUE_META[name];
      const group = meta?.legacy ? 'Без потребителя' : name.includes('-') && meta ? 'По устройствам' : 'Каталоги и слоты';
      return opt(name, meta?.label ?? name, group);
    })
    .sort((a, b) => a.group!.localeCompare(b.group!, 'ru') || a.label.localeCompare(b.label, 'ru'));
  return [...special, ...named];
}

export const FACETS: readonly FacetDef[] = [
  {
    id: 'status',
    label: 'Статус',
    placement: 'primary',
    control: 'chips',
    values: (p, ctx) => [promoStatus(p, ctx.now)],
    options: () => STATUS_ORDER.map((s) => opt(s, STATUS_LABEL[s])),
    defaultMatch: (values) => !values.includes('expired'),
  },
  {
    id: 'format',
    label: 'Формат',
    placement: 'primary',
    control: 'chips',
    values: (p) => [p.format],
    options: () => promoFormats.map((f) => opt(f, FORMAT_LABEL[f].name)),
  },
  {
    id: 'queue',
    label: 'Очередь',
    placement: 'more',
    control: 'select',
    values: (p, ctx) => {
      const qs = ctx.membership[p.id] ?? [];
      const out = [...qs];
      if (qs.length === 0) out.push(NO_QUEUE);
      else if (qs.every(isLegacyQueue)) out.push(LEGACY_ONLY);
      return out;
    },
    options: queueOptions,
  },
  {
    id: 'device',
    label: 'Устройство',
    placement: 'more',
    control: 'chips',
    values: (p) => [p.deviceTarget ?? 'both'],
    options: () => [opt('both', 'Везде'), opt('desktop', 'Только десктоп'), opt('touch', 'Только тач')],
  },
  {
    id: 'audience',
    label: 'Аудитория',
    placement: 'more',
    control: 'chips',
    values: (p) => [p.audience ?? 'all'],
    options: () => [opt('all', 'Все'), opt('authenticated', 'Залогиненные'), opt('anonymous', 'Гости')],
  },
  {
    id: 'seller',
    label: 'Роль',
    placement: 'more',
    control: 'chips',
    values: (p) => [p.sellerStatus ?? 'any'],
    options: () => [opt('any', 'Любая'), opt('seller', 'Продавцы'), opt('buyer', 'Покупатели')],
  },
  {
    id: 'targeting',
    label: 'Таргетинг',
    placement: 'more',
    control: 'select',
    values: (p) => activeTargetingIds(p),
    options: () => TARGETING_FILTERS.map((f) => opt(f.id, f.label)),
  },
  {
    id: 'flags',
    label: 'Признаки',
    placement: 'more',
    control: 'select',
    mode: 'all',
    values: (p, ctx) => [...promoFlags(p, ctx)],
    options: () => FLAG_ORDER.map((f) => opt(f, FLAG_LABEL[f])),
  },
  {
    id: 'os',
    label: 'ОС',
    placement: 'more',
    control: 'chips',
    values: (p) => p.targeting.os ?? [],
    options: () => OS_OPTIONS.map((o) => opt(o.value, o.label)),
  },
  {
    id: 'env',
    label: 'Среда',
    placement: 'more',
    control: 'chips',
    values: (p) => p.targeting.environments ?? [],
    options: () => ENVIRONMENT_OPTIONS.map((o) => opt(o.value, o.label)),
  },
  {
    id: 'brand',
    label: 'Класс устройства',
    placement: 'more',
    control: 'chips',
    values: (p) => p.targeting.deviceBrands ?? [],
    options: () => DEVICE_BRAND_OPTIONS.map((o) => opt(o.value, o.label)),
  },
  {
    id: 'geo',
    label: 'Гео по IP',
    placement: 'more',
    control: 'chips',
    values: (p) => p.targeting.geoSegments ?? [],
    options: () => [opt('local', 'Местные'), opt('tourist', 'Туристы'), opt('other', 'Другое')],
  },
  {
    id: 'entry',
    label: 'Источник захода',
    placement: 'more',
    control: 'chips',
    values: (p) => p.entrySources ?? [],
    options: () => [opt('direct', 'Прямой'), opt('search', 'Поиск'), opt('telegram', 'Telegram'), opt('other', 'Другое')],
  },
  {
    id: 'section',
    label: 'Разделы',
    placement: 'more',
    control: 'select',
    values: (p) => p.sections ?? [],
  },
  {
    id: 'category',
    label: 'Категории',
    placement: 'more',
    control: 'select',
    values: (p) => p.categories ?? [],
  },
  {
    id: 'variant',
    label: 'Custom-вариант',
    placement: 'more',
    control: 'select',
    values: (p) => (p.format === 'custom' && p.variant ? [p.variant] : []),
    options: () => KNOWN_CUSTOM_VARIANTS.map((v) => opt(v.id, v.label)),
  },
];

export const FACET_BY_ID: Record<string, FacetDef> = Object.fromEntries(FACETS.map((f) => [f.id, f]));

/** Опции фасета: статичные или собранные из пула (union значений). */
export function facetOptions(facet: FacetDef, promos: readonly Promo[], ctx: FacetContext): FacetOption[] {
  if (facet.options) return [...facet.options(ctx)];
  const seen = new Set<string>();
  for (const p of promos) for (const v of facet.values(p, ctx)) seen.add(v);
  return [...seen]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((v) => opt(v, facet.optionLabel?.(v) ?? v));
}

/* ───────────────────────── сортировка ───────────────────────── */

export type SortKey = 'start-desc' | 'start-asc' | 'end-asc' | 'end-desc' | 'title' | 'format' | 'queues';
export const SORT_ORDER: readonly SortKey[] = ['start-desc', 'start-asc', 'end-asc', 'end-desc', 'title', 'format', 'queues'];
export const SORT_LABEL: Record<SortKey, string> = {
  'start-desc': 'Сначала новые',
  'start-asc': 'Сначала старые',
  'end-asc': 'Скоро заканчиваются',
  'end-desc': 'Дольше всех идут',
  title: 'По названию',
  format: 'По формату',
  queues: 'По числу очередей',
};
export const DEFAULT_SORT: SortKey = 'start-desc';

export function sortPromos(promos: readonly Promo[], sort: SortKey, membership: Membership = {}): Promo[] {
  const byTitle = (a: Promo, b: Promo) => a.title.localeCompare(b.title, 'ru');
  const byTime = (pick: (p: Promo) => number | null, dir: 1 | -1) => (a: Promo, b: Promo) => {
    const ta = pick(a);
    const tb = pick(b);
    if (ta === null && tb === null) return byTitle(a, b);
    if (ta === null) return 1; // без даты — в конец при любом направлении
    if (tb === null) return -1;
    return (ta - tb) * dir || byTitle(a, b);
  };
  const cmp: Record<SortKey, (a: Promo, b: Promo) => number> = {
    'start-desc': byTime((p) => time(p.startsAt), -1),
    'start-asc': byTime((p) => time(p.startsAt), 1),
    'end-asc': byTime((p) => time(p.endsAt), 1),
    'end-desc': byTime((p) => time(p.endsAt), -1),
    title: byTitle,
    format: (a, b) => a.format.localeCompare(b.format) || byTitle(a, b),
    queues: (a, b) => (membership[b.id]?.length ?? 0) - (membership[a.id]?.length ?? 0) || byTitle(a, b),
  };
  return [...promos].sort(cmp[sort]);
}

/* ───────────────────────── состояние ───────────────────────── */

export type ViewMode = 'cards' | 'table';

export interface PromoListFilters {
  q: string;
  /** Пересечение окна показа с периодом, дни YYYY-MM-DD (МСК). */
  from: string;
  to: string;
  facets: Record<string, string[]>;
  sort: SortKey;
  view: ViewMode;
}

export const EMPTY_FILTERS: PromoListFilters = {
  q: '',
  from: '',
  to: '',
  facets: {},
  sort: DEFAULT_SORT,
  view: 'cards',
};

export function selected(f: PromoListFilters, facetId: string): string[] {
  return f.facets[facetId] ?? [];
}

/** Переключить значение фасета; пустой список из facets убирается. */
export function toggleFacetValue(f: PromoListFilters, facetId: string, value: string): PromoListFilters {
  const cur = selected(f, facetId);
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return setFacet(f, facetId, next);
}

export function setFacet(f: PromoListFilters, facetId: string, values: readonly string[]): PromoListFilters {
  const facets = { ...f.facets };
  if (values.length) facets[facetId] = [...values];
  else delete facets[facetId];
  return { ...f, facets };
}

/** Сколько условий задано (для «Сбросить N»). Сортировка и вид не считаются. */
export function activeFilterCount(f: PromoListFilters): number {
  return (
    (f.q.trim() ? 1 : 0) +
    (f.from || f.to ? 1 : 0) +
    Object.values(f.facets).filter((v) => v.length > 0).length
  );
}

type SearchParamsLike = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function readParam(sp: SearchParamsLike, name: string): string | null {
  if (typeof (sp as { get?: unknown }).get === 'function') {
    return (sp as { get(name: string): string | null }).get(name);
  }
  const v = (sp as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayOrEmpty = (v: string | null) => (v && DAY_RE.test(v) ? v : '');

/** Разбор URL-параметров в состояние. Неизвестные фасеты/значения молча отбрасываются. */
export function parseFilters(sp: SearchParamsLike, ctx?: FacetContext): PromoListFilters {
  const facets: Record<string, string[]> = {};
  for (const facet of FACETS) {
    const raw = readParam(sp, facet.id);
    if (!raw) continue;
    const allowed = facet.options && ctx ? new Set(facet.options(ctx).map((o) => o.id)) : null;
    const values: string[] = [];
    for (const item of raw.split(',')) {
      const v = item.trim().slice(0, 80);
      if (v && !values.includes(v) && (!allowed || allowed.has(v))) values.push(v);
    }
    if (values.length) facets[facet.id] = values;
  }
  const sort = readParam(sp, 'sort');
  const view = readParam(sp, 'view');
  return {
    q: (readParam(sp, 'q') ?? '').slice(0, 200),
    from: dayOrEmpty(readParam(sp, 'from')),
    to: dayOrEmpty(readParam(sp, 'to')),
    facets,
    sort: sort && (SORT_ORDER as readonly string[]).includes(sort) ? (sort as SortKey) : DEFAULT_SORT,
    view: view === 'table' ? 'table' : 'cards',
  };
}

/** Обратно в query-строку. Дефолты не пишутся, чтобы URL оставался чистым. */
export function serializeFilters(f: PromoListFilters): string {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set('q', f.q.trim());
  if (f.from) sp.set('from', f.from);
  if (f.to) sp.set('to', f.to);
  for (const facet of FACETS) {
    const values = f.facets[facet.id];
    if (values?.length) sp.set(facet.id, values.join(','));
  }
  if (f.sort !== DEFAULT_SORT) sp.set('sort', f.sort);
  if (f.view !== 'cards') sp.set('view', f.view);
  return sp.toString();
}

/* ───────────────────────── отбор ───────────────────────── */

/** Нормализация для поиска: регистр, ё→е, лишние пробелы. */
export function normalizeText(s: string): string {
  return s.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
}

/** Поиск по id / названию / заголовку / описанию / ссылке / варианту / якорю / шагам. */
export function matchesQuery(p: Promo, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = [
    p.id, p.name, p.title, p.description, p.action?.href, p.action?.label, p.variant, p.anchor, p.format,
    ...(p.steps ?? []).flatMap((s) => [s.title, s.body]),
  ];
  return hay.some((s) => s !== undefined && normalizeText(s).includes(q));
}

/** Окно показа пересекается с периодом [from; to] (дни МСК, включительно). */
export function matchesPeriod(p: Promo, from: string, to: string): boolean {
  if (!from && !to) return true;
  const start = time(p.startsAt);
  const end = time(p.endsAt);
  if (from) {
    const f = new Date(`${from}T00:00:00+03:00`).getTime();
    if (!Number.isNaN(f) && end !== null && end < f) return false;
  }
  if (to) {
    const t = new Date(`${to}T00:00:00+03:00`).getTime() + 86_400_000;
    if (!Number.isNaN(t) && start !== null && start >= t) return false;
  }
  return true;
}

function facetMatches(facet: FacetDef, p: Promo, f: PromoListFilters, ctx: FacetContext): boolean {
  const chosen = f.facets[facet.id];
  const values = facet.values(p, ctx);
  if (!chosen?.length) return facet.defaultMatch ? facet.defaultMatch(values) : true;
  return facet.mode === 'all'
    ? chosen.every((v) => values.includes(v))
    : chosen.some((v) => values.includes(v));
}

function baseMatches(p: Promo, f: PromoListFilters): boolean {
  return matchesQuery(p, f.q) && matchesPeriod(p, f.from, f.to);
}

export function applyFilters(promos: readonly Promo[], f: PromoListFilters, ctx: FacetContext): Promo[] {
  const picked = promos.filter((p) => baseMatches(p, f) && FACETS.every((facet) => facetMatches(facet, p, f, ctx)));
  return sortPromos(picked, f.sort, ctx.membership);
}

export type FacetCounts = Record<string, Record<string, number>>;

/**
 * Фасетные счётчики: для каждого фасета считаем по промо, прошедшим поиск,
 * период и ВСЕ ОСТАЛЬНЫЕ фасеты (классический faceted search — цифра на чипе
 * говорит «сколько станет, если нажать»). Для статуса это значит, что
 * «Архив N» виден всегда, хотя по умолчанию архив скрыт.
 */
export function facetCounts(promos: readonly Promo[], f: PromoListFilters, ctx: FacetContext): FacetCounts {
  const counts: FacetCounts = Object.fromEntries(FACETS.map((facet) => [facet.id, {}]));
  for (const p of promos) {
    if (!baseMatches(p, f)) continue;
    const pass = FACETS.map((facet) => facetMatches(facet, p, f, ctx));
    FACETS.forEach((facet, i) => {
      if (!pass.every((ok, j) => j === i || ok)) return;
      const bucket = counts[facet.id];
      for (const v of facet.values(p, ctx)) bucket[v] = (bucket[v] ?? 0) + 1;
    });
  }
  return counts;
}
