import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import { PromoList } from './PromoList';

const base: Omit<Promo, 'format'> = {
  id: 'x',
  name: 'X',
  title: 'Заголовок',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2030-01-01T00:00:00.000Z',
  targeting: {},
  cooldownHours: 0,
};

function make(id: string, format: Promo['format']): Promo {
  return { ...base, id, format } as Promo;
}

function render(promos: Promo[]): string {
  return renderToStaticMarkup(
    <PromoList promos={promos} membership={{}} queueNames={['transport']} />,
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
