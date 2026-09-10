import { describe, expect, it } from 'vitest';
import type { Promo } from './schema';
import {
  EMPTY_FILTERS,
  LEGACY_ONLY,
  NO_QUEUE,
  activeFilterCount,
  applyFilters,
  buildFacetContext,
  daysUntilEnd,
  facetCounts,
  facetOptions,
  FACET_BY_ID,
  matchesPeriod,
  matchesQuery,
  parseFilters,
  promoFlags,
  promoStatus,
  serializeFilters,
  sortPromos,
  toggleFacetValue,
} from './promo-filters';

const NOW = new Date('2026-09-09T12:00:00.000Z').getTime();
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toISOString();

function make(id: string, over: Partial<Promo> = {}): Promo {
  return {
    id,
    name: id,
    title: `Заголовок ${id}`,
    format: 'inline',
    startsAt: day(-10),
    endsAt: day(30),
    targeting: {},
    cooldownHours: 0,
    ...over,
  } as Promo;
}

const active = make('active', { imageUrl: 'https://x/1.png', action: { href: 'https://x' } });
const scheduled = make('scheduled', { startsAt: day(2), endsAt: day(20), format: 'popup' });
const expired = make('expired', { startsAt: day(-30), endsAt: day(-1), format: 'topline' });
const endingSoon = make('soon', { endsAt: day(3), format: 'promoline', targeting: { os: ['ios'] } });
const chained = make('child', { afterPromoId: 'active', audience: 'authenticated', deviceTarget: 'touch' });
const broken = make('broken', { afterClickPromoId: 'ghost', leadCapture: true, leadPhone: '+79991234567' });
const custom = make('cust', { format: 'custom', variant: 'referral-invite', sections: ['home'] });

const POOL = [active, scheduled, expired, endingSoon, chained, broken, custom];
const MEMBERSHIP = {
  active: ['home', 'home-web'],
  scheduled: ['home-popup'],
  soon: ['transport'],
  child: ['home'],
};
const QUEUES = ['home', 'home-web', 'home-popup', 'transport', 'main'];
const ctx = buildFacetContext(POOL, MEMBERSHIP, QUEUES, NOW);

describe('promoStatus / daysUntilEnd', () => {
  it('classifies by the date window', () => {
    expect(promoStatus(active, NOW)).toBe('active');
    expect(promoStatus(scheduled, NOW)).toBe('scheduled');
    expect(promoStatus(expired, NOW)).toBe('expired');
  });
  it('counts whole days left, negative once expired', () => {
    expect(daysUntilEnd(endingSoon, NOW)).toBe(3);
    expect(daysUntilEnd(expired, NOW)).toBe(-1);
  });
});

describe('promoFlags', () => {
  it('warns about missing queue, image and CTA', () => {
    const f = promoFlags(custom, ctx);
    expect(f.has('noQueue')).toBe(true);
    // custom-формат картинку и кнопку не умеет — не шумим
    expect(f.has('noImage')).toBe(false);
    expect(f.has('noCta')).toBe(false);
    const inlineNoAssets = promoFlags(chained, ctx);
    expect(inlineNoAssets.has('noImage')).toBe(true);
    expect(inlineNoAssets.has('noCta')).toBe(true);
  });
  it('detects legacy-only membership and chain relations', () => {
    expect(promoFlags(scheduled, ctx).has('legacyOnly')).toBe(true);
    expect(promoFlags(active, ctx).has('legacyOnly')).toBe(false);
    expect(promoFlags(active, ctx).has('chainParent')).toBe(true);
    expect(promoFlags(chained, ctx).has('chain')).toBe(true);
    expect(promoFlags(chained, ctx).has('chainBroken')).toBe(false);
    expect(promoFlags(broken, ctx).has('chainBroken')).toBe(true);
    expect(promoFlags(broken, ctx).has('lead')).toBe(true);
  });
  it('flags endsSoon only for active promos within the window', () => {
    expect(promoFlags(endingSoon, ctx).has('endsSoon')).toBe(true);
    expect(promoFlags(active, ctx).has('endsSoon')).toBe(false);
    expect(promoFlags(expired, ctx).has('endsSoon')).toBe(false);
  });
  it('marks promos without any targeting', () => {
    expect(promoFlags(active, ctx).has('noTargeting')).toBe(true);
    expect(promoFlags(endingSoon, ctx).has('noTargeting')).toBe(false);
  });
});

describe('matchesQuery', () => {
  it('is case-insensitive and folds ё', () => {
    const p = make('x', { title: 'Ёлки-палки', description: 'Скидка на ШИНЫ' });
    expect(matchesQuery(p, 'елки')).toBe(true);
    expect(matchesQuery(p, 'шины')).toBe(true);
    expect(matchesQuery(p, 'диски')).toBe(false);
  });
  it('searches CTA href, variant, anchor and wizard steps', () => {
    expect(matchesQuery(active, 'https://x')).toBe(true);
    expect(matchesQuery(custom, 'referral')).toBe(true);
    const ms = make('ms', { format: 'multistep', steps: [{ title: 'Шаг один', body: 'тело' }, { title: 'Два', body: 'ещё' }] });
    expect(matchesQuery(ms, 'шаг один')).toBe(true);
  });
});

describe('matchesPeriod', () => {
  it('keeps promos whose window intersects the period', () => {
    const p = make('p', { startsAt: '2026-09-10T00:00:00.000Z', endsAt: '2026-09-20T00:00:00.000Z' });
    expect(matchesPeriod(p, '2026-09-15', '2026-09-16')).toBe(true);
    expect(matchesPeriod(p, '2026-09-01', '2026-09-09')).toBe(false);
    expect(matchesPeriod(p, '2026-09-21', '')).toBe(false);
    expect(matchesPeriod(p, '', '2026-09-10')).toBe(true);
  });
});

describe('applyFilters', () => {
  it('hides expired promos by default and shows them when the status is chosen', () => {
    const ids = applyFilters(POOL, EMPTY_FILTERS, ctx).map((p) => p.id);
    expect(ids).not.toContain('expired');
    expect(ids).toHaveLength(POOL.length - 1);
    const onlyExpired = applyFilters(POOL, { ...EMPTY_FILTERS, facets: { status: ['expired'] } }, ctx);
    expect(onlyExpired.map((p) => p.id)).toEqual(['expired']);
  });
  it('ORs values inside a facet and ANDs facets', () => {
    const f = { ...EMPTY_FILTERS, facets: { format: ['popup', 'topline'], status: ['scheduled', 'expired'] } };
    expect(applyFilters(POOL, f, ctx).map((p) => p.id).sort()).toEqual(['expired', 'scheduled']);
    const f2 = { ...EMPTY_FILTERS, facets: { format: ['popup'], device: ['touch'] } };
    expect(applyFilters(POOL, f2, ctx)).toHaveLength(0);
  });
  it('supports the special queue values', () => {
    const none = applyFilters(POOL, { ...EMPTY_FILTERS, facets: { queue: [NO_QUEUE] } }, ctx);
    expect(none.map((p) => p.id).sort()).toEqual(['broken', 'cust']);
    // Очереди без потребителя: home-popup (легаси-слот) и голые каталожные
    // home/transport — витрина ходит только в `<каталог>-<устройство>`.
    // `active` не попадает: он ещё и в home-web, которую витрина запрашивает.
    const legacy = applyFilters(POOL, { ...EMPTY_FILTERS, facets: { queue: [LEGACY_ONLY] } }, ctx);
    expect(legacy.map((p) => p.id).sort()).toEqual(['child', 'scheduled', 'soon']);
    const home = applyFilters(POOL, { ...EMPTY_FILTERS, facets: { queue: ['home'] } }, ctx);
    expect(home.map((p) => p.id).sort()).toEqual(['active', 'child']);
  });
  it('ANDs flags so two warnings must both hold', () => {
    const f = { ...EMPTY_FILTERS, facets: { flags: ['noImage', 'chain'] } };
    expect(applyFilters(POOL, f, ctx).map((p) => p.id).sort()).toEqual(['broken', 'child']);
  });
  it('filters by targeting registry ids and raw targeting values', () => {
    expect(applyFilters(POOL, { ...EMPTY_FILTERS, facets: { targeting: ['os'] } }, ctx).map((p) => p.id)).toEqual(['soon']);
    expect(applyFilters(POOL, { ...EMPTY_FILTERS, facets: { os: ['android'] } }, ctx)).toHaveLength(0);
    expect(applyFilters(POOL, { ...EMPTY_FILTERS, facets: { section: ['home'] } }, ctx).map((p) => p.id)).toEqual(['cust']);
    expect(applyFilters(POOL, { ...EMPTY_FILTERS, facets: { audience: ['authenticated'] } }, ctx).map((p) => p.id)).toEqual(['child']);
  });
});

describe('sortPromos', () => {
  it('sorts by end date ascending with a title tiebreak', () => {
    const ids = sortPromos([active, endingSoon, scheduled], 'end-asc').map((p) => p.id);
    expect(ids).toEqual(['soon', 'scheduled', 'active']);
  });
  it('sorts by queue count descending', () => {
    const ids = sortPromos([custom, active, chained], 'queues', MEMBERSHIP).map((p) => p.id);
    expect(ids).toEqual(['active', 'child', 'cust']);
  });
});

describe('facetCounts', () => {
  it('counts each facet against the other facets only', () => {
    const f = { ...EMPTY_FILTERS, facets: { format: ['popup'] } };
    const c = facetCounts(POOL, f, ctx);
    // статус считается без учёта собственного выбора, но с учётом формата
    expect(c.status).toEqual({ scheduled: 1 });
    // формат — по всем не-архивным промо, независимо от выбранного формата
    expect(c.format.inline).toBe(3);
    expect(c.format.popup).toBe(1);
    expect(c.format.topline).toBeUndefined();
  });
  it('always shows the archive count even though archive is hidden by default', () => {
    expect(facetCounts(POOL, EMPTY_FILTERS, ctx).status.expired).toBe(1);
  });
  it('collects data-driven options from the pool', () => {
    expect(facetOptions(FACET_BY_ID.section, POOL, ctx)).toEqual([{ id: 'home', label: 'home', group: undefined }]);
    const queue = facetOptions(FACET_BY_ID.queue, POOL, ctx);
    expect(queue.map((o) => o.id)).toContain(NO_QUEUE);
    expect(queue.find((o) => o.id === 'home-popup')?.group).toBe('Без потребителя');
    expect(queue.find((o) => o.id === 'transport')?.group).toBe('Без потребителя');
    expect(queue.find((o) => o.id === 'home-web')?.group).toBe('По устройствам');
  });
});

describe('URL state', () => {
  it('round-trips through the query string', () => {
    const f = {
      ...EMPTY_FILTERS,
      q: 'шины',
      from: '2026-09-01',
      to: '2026-09-30',
      facets: { status: ['active', 'expired'], queue: [NO_QUEUE, 'home'], flags: ['noImage'] },
      sort: 'end-asc' as const,
      view: 'table' as const,
    };
    const qs = serializeFilters(f);
    expect(qs).toContain('status=active%2Cexpired');
    expect(parseFilters(new URLSearchParams(qs), ctx)).toEqual(f);
  });
  it('drops unknown values, bad dates and unknown sort', () => {
    const sp = new URLSearchParams('status=active,bogus&format=nope&queue=home,unknown&sort=weird&from=2026-13&view=x');
    const f = parseFilters(sp, ctx);
    expect(f.facets).toEqual({ status: ['active'], queue: ['home'] });
    expect(f.sort).toBe('start-desc');
    expect(f.from).toBe('');
    expect(f.view).toBe('cards');
  });
  it('accepts the Next searchParams object shape too', () => {
    expect(parseFilters({ q: 'x', format: ['inline'] }, ctx).facets).toEqual({ format: ['inline'] });
  });
  it('omits defaults so the URL stays clean', () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe('');
  });
  it('toggles facet values and counts active filters', () => {
    let f = toggleFacetValue(EMPTY_FILTERS, 'format', 'inline');
    expect(f.facets.format).toEqual(['inline']);
    expect(activeFilterCount(f)).toBe(1);
    f = toggleFacetValue(f, 'format', 'inline');
    expect(f.facets.format).toBeUndefined();
    expect(activeFilterCount({ ...f, q: 'a', from: '2026-01-01' })).toBe(2);
  });
});
