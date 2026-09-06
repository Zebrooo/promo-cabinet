import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import {
  promoPreviewSurfaceFlags,
  promoPreviewSurfaceStyle,
  toAdvertisement,
} from './PromoPreview';

describe('toAdvertisement', () => {
  it.each(['inline', 'topline'] as const)(
    'passes %s surface, title and description colors to promo-renderer',
    (format) => {
      const promo: Promo = {
        id: `parts-${format}`,
        name: 'Parts promo',
        title: 'Запчасть найдут магазины',
        description: 'Опишите её один раз',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2027-01-01T00:00:00.000Z',
        targeting: {},
        cooldownHours: 5,
        format,
        backgroundColor: '#F6F7F8',
        textColor: '#16181D',
        descriptionColor: '#646A73',
      };

      const ad = toAdvertisement(promo);

      expect(ad.backgroundColor).toBe('#F6F7F8');
      expect(ad.textColor).toBe('#16181D');
      expect(ad.descriptionColor).toBe('#646A73');
    },
  );

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

describe('promoPreviewSurfaceStyle', () => {
  const topline: Promo = {
    id: 'parts-topline',
    name: 'Parts topline',
    title: 'Запчасть найдут магазины',
    description: 'Опишите её один раз',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
    targeting: {},
    cooldownHours: 5,
    format: 'topline',
  };

  it('passes validated colors to the renderer preview surface', () => {
    expect(promoPreviewSurfaceStyle({
      ...topline,
      backgroundColor: '#FDFCFB',
      textColor: '#112233',
      descriptionColor: '#445566',
      ctaColor: '#AABBCCDD',
      ctaTextColor: '#fff',
      action: { href: '/parts/request', label: 'Цена "сейчас" \\' },
    })).toEqual({
      '--promo-preview-background': '#FDFCFB',
      '--promo-preview-title': '#112233',
      '--promo-preview-description': '#445566',
      '--promo-preview-cta-bg': '#AABBCCDD',
      '--promo-preview-cta-color': '#fff',
    });
  });

  it('inherits a valid title color for the description and rejects arbitrary CSS', () => {
    expect(promoPreviewSurfaceStyle({
      ...topline,
      backgroundColor: 'url(https://example.test/pixel)',
      textColor: '#334455',
      descriptionColor: '#12; display:none',
      ctaColor: 'red',
      ctaTextColor: '',
      action: { href: '/parts/request' },
    })).toEqual({
      '--promo-preview-background': '#2563EB',
      '--promo-preview-title': '#334455',
      '--promo-preview-description': '#334455',
      '--promo-preview-cta-bg': '#E11D2A',
      '--promo-preview-cta-color': '#FFFFFF',
    });
  });
});

describe('promoPreviewSurfaceFlags', () => {
  const topline: Promo = {
    id: 'parts-topline',
    name: 'Parts topline',
    title: 'Запчасть найдут магазины',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
    targeting: {},
    cooldownHours: 5,
    format: 'topline',
  };

  it('resets opacity only for a valid explicit description color', () => {
    expect(promoPreviewSurfaceFlags({
      ...topline,
      descriptionColor: '#606671',
    }).hasDescriptionColor).toBe(true);
    expect(promoPreviewSurfaceFlags({
      ...topline,
      descriptionColor: 'not-a-color',
    }).hasDescriptionColor).toBe(false);
  });
});
