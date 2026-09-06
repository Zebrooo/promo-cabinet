import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Promo } from '@/lib/schema';
import { QueueEditor } from './QueueEditor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function promo(id: string, format: Promo['format']): Promo {
  return {
    id,
    name: id,
    title: id,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2030-01-01T00:00:00.000Z',
    targeting: {},
    cooldownHours: 0,
    format,
  } as Promo;
}

function render(name: string): string {
  return renderToStaticMarkup(
    <QueueEditor
      name={name}
      persist
      promos={[]}
      poolPromos={[
        promo('eligible-promoline', 'promoline'),
        promo('wrong-inline', 'inline'),
      ]}
    />,
  );
}

describe('QueueEditor fixed-format queues', () => {
  it('shows the human label and placement hint', () => {
    const html = render('persistent-promoline');
    expect(html).toContain('Персистентный промолайн');
    expect(html).toContain('Постоянный промолайн между объявлениями витрины');
    expect(html).toContain('persistent-promoline');
  });

  it('offers only compatible promos in the add picker', () => {
    const html = render('persistent-promoline');
    expect(html).toContain('eligible-promoline');
    expect(html).not.toContain('wrong-inline');
  });

  it('keeps custom queues unrestricted', () => {
    const html = render('custom-queue');
    expect(html).toContain('eligible-promoline');
    expect(html).toContain('wrong-inline');
  });
});
