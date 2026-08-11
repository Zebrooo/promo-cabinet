import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import { toAdvertisement } from './PromoPreview';

describe('toAdvertisement', () => {
  it('passes multistep action and CTA colors to promo-renderer', () => {
    const promo: Promo = {
      id: 'campaign-onboarding',
      name: 'Онбординг кампаний',
      title: 'Реклама на Абхаз Авто',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
      targeting: {},
      cooldownHours: 24,
      format: 'multistep',
      steps: [
        { title: 'Шаг 1', body: 'Текст 1' },
        { title: 'Шаг 2', body: 'Текст 2' },
      ],
      action: { href: '/lk/prodvizhenie/banner/new', label: 'Создать кампанию' },
      ctaColor: '#123456',
      ctaTextColor: '#ffffff',
    };

    const ad = toAdvertisement(promo);

    expect(ad.action).toEqual(promo.action);
    expect(ad.ctaColor).toBe('#123456');
    expect(ad.ctaTextColor).toBe('#ffffff');
  });
});
