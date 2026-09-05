import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPromoTimeline } from '@/lib/bff-client';
import { PromoAnalyticsBlock } from './PromoAnalyticsBlock';

vi.mock('@/lib/bff-client', () => ({
  getPromoTimeline: vi.fn(),
}));

const getPromoTimelineMock = vi.mocked(getPromoTimeline);

afterEach(() => {
  vi.resetAllMocks();
});

describe('PromoAnalyticsBlock', () => {
  it('показывает отдельное состояние, когда статистика недоступна', async () => {
    getPromoTimelineMock.mockRejectedValueOnce(new Error('BFF timeout'));

    const html = renderToStaticMarkup(await PromoAnalyticsBlock({ promoId: 'parts-rfq' }));

    expect(html).toContain('Статистика временно недоступна');
    expect(html).not.toContain('Показов пока нет');
  });

  it('оставляет empty-state только для успешно загруженной пустой статистики', async () => {
    getPromoTimelineMock.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await PromoAnalyticsBlock({ promoId: 'parts-rfq' }));

    expect(html).toContain('Показов пока нет — появятся, когда промо начнут показывать.');
    expect(html).not.toContain('Статистика временно недоступна');
  });
});
