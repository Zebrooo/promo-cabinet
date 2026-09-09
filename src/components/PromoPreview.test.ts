import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import { promoFormats } from '@/lib/schema';
import {
  promoPreviewSurfaceFlags,
  promoPreviewSurfaceStyle,
  toAdvertisement,
} from './PromoPreview';

describe('toAdvertisement', () => {
  it.each(['inline', 'promoline', 'topline'] as const)(
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

  // promoline — нативный формат @zebrooo/promo-renderer: формат отдаётся как
  // есть (превью рендерит нативный promoline), вместе с позицией в ленте.
  it('passes promoline through as is, keeping the inline content and afterListings', () => {
    const promo: Promo = {
      id: 'parts-rfq-promoline',
      name: 'Запчасти — строка в ленте',
      title: 'Запчасть найдут магазины',
      description: 'Опишите её один раз',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
      targeting: {},
      cooldownHours: 5,
      format: 'promoline',
      imageUrl: 'https://cdn.example.com/part.png',
      action: { href: '/parts/request', label: 'Оставить заявку' },
      afterListings: 8,
    };

    const ad = toAdvertisement(promo);

    expect(ad.format).toBe('promoline');
    expect(ad.afterListings).toBe(8);
    expect(ad.title).toBe('Запчасть найдут магазины');
    expect(ad.description).toBe('Опишите её один раз');
    expect(ad.imageUrl).toBe('https://cdn.example.com/part.png');
    expect(ad.action).toEqual({ href: '/parts/request', label: 'Оставить заявку' });
  });

  it('does not rewrite the format of any promo type', () => {
    for (const format of promoFormats) {
      const ad = toAdvertisement({
        id: `id-${format}`,
        name: format,
        title: 'T',
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2027-01-01T00:00:00.000Z',
        targeting: {},
        cooldownHours: 0,
        format,
      });
      expect(ad.format, format).toBe(format);
    }
  });

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

describe('promoPreviewSurfaceStyle — promoline', () => {
  const base: Omit<Promo, 'format'> = {
    id: 'parts-rfq-promoline',
    name: 'Запчасти — строка в ленте',
    title: 'Запчасть найдут магазины',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2027-01-01T00:00:00.000Z',
    targeting: {},
    cooldownHours: 5,
  };

  it('uses the inline defaults, not the topline palette', () => {
    expect(promoPreviewSurfaceStyle({ ...base, format: 'promoline' }))
      .toEqual(promoPreviewSurfaceStyle({ ...base, format: 'inline' }));
    expect(promoPreviewSurfaceStyle({ ...base, format: 'promoline' })['--promo-preview-background'])
      .toBe('#FFFFFF');
  });

  it('honours configured colors exactly like inline', () => {
    const colors = { backgroundColor: '#F6F7F8', textColor: '#112233', descriptionColor: '#445566' };
    expect(promoPreviewSurfaceStyle({ ...base, ...colors, format: 'promoline' }))
      .toEqual(promoPreviewSurfaceStyle({ ...base, ...colors, format: 'inline' }));
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
