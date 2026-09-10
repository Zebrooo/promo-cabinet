/**
 * Защита от мёртвых полей: для каждого из девяти форматов фикстура содержит
 * ВСЕ ключи, которые форма реально предлагает для этого формата (см.
 * components/promo-form/content/*.tsx и секции), и после safeParse ни один
 * из них не должен пропасть. Обратная проверка: у схемы формата нет ключей,
 * которых форма никогда не выставляет (кроме явного allowlist с причиной).
 */
import { describe, expect, it } from 'vitest';
import {
  CONTENT_KEYS_BY_FORMAT, SCHEMA_BY_FORMAT, promoFormats, promoSchema, type PromoFormat,
} from './schema';
import { strippedBySchema, strippedPaths } from './schema-strip';

/** Ключи слоя serving, которые выставляют секции формы (Basics, Placement,
 *  Queues, Frequency, Targeting, CTA/лиды) — одинаковы для всех форматов. */
const SHARED_FORM_KEYS = [
  'id', 'name', 'startsAt', 'endsAt', 'targeting', 'schedule', 'maxImpressionsPerUser', 'cooldownHours',
  'afterPromoId', 'afterClickPromoId', 'suppressAfterClick', 'leadCapture', 'leadPhone', 'audience',
  'sections', 'categories', 'sellerStatus', 'lifecycle', 'entrySources', 'deviceTarget', 'format',
] as const;

const CTA = ['action', 'ctaColor', 'ctaTextColor'] as const;

/** Контентные ключи, которые предлагает форма — по компонентам content/*. */
const FORM_CONTENT_KEYS: Record<PromoFormat, readonly string[]> = {
  inline:     ['title', 'description', 'backgroundColor', 'textColor', 'descriptionColor', 'imageUrl', 'textAlign', ...CTA],
  promoline:  ['title', 'description', 'backgroundColor', 'textColor', 'descriptionColor', 'imageUrl', 'textAlign', ...CTA, 'afterListings'],
  topline:    ['title', 'description', 'backgroundColor', 'textColor', 'descriptionColor', ...CTA],
  popup:      ['title', 'description', 'imageUrl', 'backgroundColor', 'textColor', 'backgroundImage', 'backgroundGradient', 'textAlign', 'dismissible', ...CTA],
  fullscreen: ['title', 'description', 'imageUrl', 'backgroundColor', 'textColor', 'backgroundImage', 'backgroundGradient', 'textAlign', 'dismissible', ...CTA],
  tooltip:    ['title', 'anchor', 'description', 'imageUrl', 'backgroundColor', 'textColor', 'textAlign', 'dismissible', ...CTA],
  multistep:  ['title', 'steps', 'presentation', 'backgroundColor', 'textColor', 'backgroundImage', 'backgroundGradient', ...CTA],
  divkit:     ['title', 'divkitJson', 'divkitUrl'],
  custom:     ['variant', 'dismissible', 'referralActive', 'referralInviterCreditKopecks', 'referralSellerBonusKopecks',
               'referralDailyInviteCap', 'referralHoldHours', 'dailyBudgetKopecks'],
};

/** Ключи, которые есть в схеме формата, но форма их не выставляет — каждому
 *  нужна причина; без неё это «забытая строка в форме» или мёртвое поле. */
const SCHEMA_ONLY_KEYS: Partial<Record<PromoFormat, Record<string, string>>> = {
  popup: { divkitUrl: 'legacy-фолбэк popup→divkit: витрина умеет рендерить popup DivKit-вёрсткой, кабинет поле не редактирует (только сохраняет старые промо)' },
};

/** Валидное значение для каждого ключа. */
const VALUES: Record<string, unknown> = {
  id: 'fixture', name: 'Фикстура', title: 'Заголовок',
  startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z',
  targeting: { minAge: 18, geoSegments: ['tourist'], advertiser: { everLaunched: true } },
  schedule: { daysOfWeek: [1, 2], hourStart: 9, hourEnd: 18 },
  maxImpressionsPerUser: 3, cooldownHours: 12,
  afterPromoId: 'other-1', afterClickPromoId: 'other-2', suppressAfterClick: true,
  leadCapture: true, leadPhone: '+79991234567',
  audience: 'authenticated', sections: ['avto'], categories: ['kvartiry'], sellerStatus: 'seller',
  lifecycle: { soldWithinDays: 7 }, entrySources: ['direct'], deviceTarget: 'both',
  description: 'Описание', backgroundColor: '#ffffff', textColor: '#000000', descriptionColor: '#333333',
  imageUrl: 'https://cdn.example.com/x.png', textAlign: 'center',
  action: { href: '/sale', label: 'Подробнее' }, ctaColor: '#e11d2a', ctaTextColor: '#ffffff',
  afterListings: 6, backgroundImage: 'https://cdn.example.com/bg.png',
  backgroundGradient: { from: '#ffffff', to: '#000000', angle: 135 }, dismissible: true,
  anchor: 'home-search',
  steps: [{ title: 'Шаг 1', body: 'Текст 1', imageUrl: 'https://cdn.example.com/s1.gif' }, { title: 'Шаг 2', body: 'Текст 2' }],
  presentation: 'fullscreen',
  divkitUrl: 'https://s3.example.com/a.json', divkitJson: { card: { log_id: 'x', states: [] } },
  variant: 'referral-invite', referralActive: true, referralInviterCreditKopecks: 10000,
  referralSellerBonusKopecks: 5000, referralDailyInviteCap: 3, referralHoldHours: 48, dailyBudgetKopecks: 100000,
};

function fixtureFor(format: PromoFormat): Record<string, unknown> {
  const keys = [...SHARED_FORM_KEYS, ...FORM_CONTENT_KEYS[format]];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === 'format') { out.format = format; continue; }
    if (!(key in VALUES)) throw new Error(`нет значения фикстуры для ключа ${key}`);
    out[key] = VALUES[key];
  }
  // custom: title (serving-ключ) не заполняется формой — дериватится в
  // toPersisted из label варианта, но схема его требует.
  if (format === 'custom') out.title = 'Онбординг';
  return out;
}

describe('strippedPaths', () => {
  it('находит пропавшие ключи на верхнем уровне, во вложенных объектах и массивах', () => {
    expect(strippedPaths({ a: 1, b: { c: 2, d: 3 }, e: [{ f: 1, g: 2 }] }, { a: 1, b: { c: 2 }, e: [{ f: 1 }] }))
      .toEqual(['b.d', 'e.0.g']);
    expect(strippedPaths({ a: undefined, b: 1 }, { b: 1 })).toEqual([]);
    expect(strippedPaths({ a: { x: 1 } }, {})).toEqual(['a']);
  });

  it('ловит мёртвое поле: popupVariant/bullets на popup молча срезаются', () => {
    expect(strippedBySchema(SCHEMA_BY_FORMAT.popup, { ...fixtureFor('popup'), popupVariant: 'split', bullets: ['a'] }).sort())
      .toEqual(['bullets', 'popupVariant']);
    expect(strippedBySchema(SCHEMA_BY_FORMAT.topline, { ...fixtureFor('topline'), imageUrl: 'https://cdn.example.com/x.png' }))
      .toEqual(['imageUrl']);
    expect(strippedBySchema(SCHEMA_BY_FORMAT.multistep, { ...fixtureFor('multistep'), description: 'd', dismissible: true }).sort())
      .toEqual(['description', 'dismissible']);
  });

  it('бросает на невалидной фикстуре (иначе проверка среза бессмысленна)', () => {
    expect(() => strippedBySchema(SCHEMA_BY_FORMAT.inline, { ...fixtureFor('inline'), title: '' })).toThrow(/title/);
  });
});

describe.each(promoFormats)('формат %s: форма и схема не расходятся', (format) => {
  it('всё, что предлагает форма, доезжает через схему члена и через promoSchema без среза', () => {
    const fixture = fixtureFor(format);
    expect(strippedBySchema(SCHEMA_BY_FORMAT[format], fixture)).toEqual([]);
    expect(strippedBySchema(promoSchema, fixture)).toEqual([]);
  });

  it('у схемы нет ключей, которых форма не выставляет (кроме allowlist с причиной)', () => {
    const offered = new Set<string>([...SHARED_FORM_KEYS, ...FORM_CONTENT_KEYS[format]]);
    const allowed = new Set(Object.keys(SCHEMA_ONLY_KEYS[format] ?? {}));
    const orphan = CONTENT_KEYS_BY_FORMAT[format].filter((k) => !offered.has(k) && !allowed.has(k));
    expect(orphan, 'ключи схемы без контрола в форме').toEqual([]);
    // Allowlist не должен протухать: причина есть, а ключа в схеме уже нет.
    const stale = [...allowed].filter((k) => !CONTENT_KEYS_BY_FORMAT[format].includes(k));
    expect(stale, 'allowlist ссылается на несуществующие ключи').toEqual([]);
  });
});
