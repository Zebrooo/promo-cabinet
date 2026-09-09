import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import { EMPTY_FILTERS, type PromoListFilters } from '@/lib/promo-filters';
import { PromoList } from './PromoList';

const NOW = new Date('2026-09-09T12:00:00.000Z').getTime();

const base: Omit<Promo, 'format'> = {
  id: 'x',
  name: 'X',
  title: 'Заголовок',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2030-01-01T00:00:00.000Z',
  targeting: {},
  cooldownHours: 0,
};

function make(id: string, format: Promo['format'], over: Partial<Promo> = {}): Promo {
  return { ...base, id, format, ...over } as Promo;
}

function render(promos: Promo[], initial: PromoListFilters = EMPTY_FILTERS, membership: Record<string, string[]> = {}): string {
  return renderToStaticMarkup(
    <PromoList promos={promos} membership={membership} queueNames={['transport', 'home-popup']} initial={initial} now={NOW} />,
  );
}

/** Счётчик конкретного чипа фильтра: <span class=chip-label>Label</span><span class=chip-count>N</span>. */
function chipCount(html: string, label: string): string | undefined {
  const chip = new RegExp(
    `<span class="chip-label">${label}</span><span class="chip-count">(\\d+)</span>`,
  ).exec(html);
  return chip?.[1];
}

describe('PromoList format filters', () => {
  it('offers a Promoline chip alongside the other formats', () => {
    const html = render([make('a', 'inline')]);
    expect(chipCount(html, 'Promoline')).toBe('0');
    expect(chipCount(html, 'Inline')).toBe('1');
  });

  it('counts promoline promos on their own chip, not on Inline', () => {
    const html = render([
      make('promoline-1', 'promoline'),
      make('promoline-2', 'promoline'),
      make('inline-1', 'inline'),
    ]);
    expect(chipCount(html, 'Promoline')).toBe('2');
    expect(chipCount(html, 'Inline')).toBe('1');
  });

  it('shows promoline promos in the default (all) view', () => {
    const html = render([make('parts-rfq-promoline', 'promoline')]);
    expect(html).toContain('parts-rfq-promoline');
    expect(html).not.toContain('Промо пока нет');
  });
});

describe('PromoList status and initial state', () => {
  const expired = make('old', 'inline', { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-02-01T00:00:00.000Z' });
  const live = make('live', 'inline');

  it('hides archived promos by default but keeps their count on the Архив chip', () => {
    const html = render([expired, live]);
    expect(chipCount(html, 'Архив')).toBe('1');
    expect(chipCount(html, 'Активные')).toBe('1');
    expect(html).toContain('/cabinet/live');
    expect(html).not.toContain('/cabinet/old');
    expect(html).toContain('ПОКАЗАНО 1 ИЗ 2');
  });

  it('renders the server-parsed filter state on first paint (shareable URL)', () => {
    const html = render([expired, live], { ...EMPTY_FILTERS, facets: { status: ['expired'] } });
    expect(html).toContain('/cabinet/old');
    expect(html).not.toContain('/cabinet/live');
    expect(html).toContain('Статус: Архив');
    expect(html).toContain('Сбросить');
  });

  it('switches to the table view from the URL state', () => {
    const html = render([live], { ...EMPTY_FILTERS, view: 'table' });
    expect(html).toContain('promo-table');
    expect(html).not.toContain('cat-grid');
  });
});

describe('PromoList card', () => {
  it('shows queue labels, the window line and warnings', () => {
    const p = make('p', 'inline', { endsAt: '2026-09-12T00:00:00.000Z' });
    const html = render([p], EMPTY_FILTERS, { p: ['transport', 'home-popup'] });
    expect(html).toContain('Транспорт');
    expect(html).toContain('до 12 сен · 3 дня');
    expect(html).toContain('pcard-qchip legacy');
    // inline без картинки и без кнопки — оба предупреждения на карточке
    expect(html).toContain('Без картинки');
    expect(html).toContain('Без кнопки');
  });

  it('warns loudly when an active promo is in no queue', () => {
    const html = render([make('p', 'popup', { imageUrl: 'https://x/1.png', action: { href: 'https://x' } })]);
    expect(html).toContain('pwarn-item severe');
    expect(html).toContain('не в очереди');
  });

  it('links lead-capturing promos to the leads report', () => {
    const html = render([make('p', 'inline', { leadCapture: true, leadPhone: '+79991234567' })]);
    expect(html).toContain('/cabinet/leads?promoId=p');
  });
});
