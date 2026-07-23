// Per-promo показы. Server component — тянет 30-дневный timeline из BFF
// /analytics/promos/timeline и показывает ТОЛЬКО количество показов по этой
// промке. Продуктовая аналитика (события/воронки/CTR) переехала в Яндекс.Метрику;
// в кабинете остаётся лишь счётчик показов. Best-effort: нет данных/BFF недоступен
// → «нет показов», не блокирует редактор.

import { getPromoTimeline, type PromoTimelineRow } from '@/lib/bff-client';

const DAYS = 30;

export async function PromoAnalyticsBlock({ promoId }: { promoId: string }) {
  let rows: PromoTimelineRow[] = [];
  try {
    rows = await getPromoTimeline(promoId, DAYS);
  } catch {
    rows = [];
  }

  const totalViews = rows.reduce((a, b) => a + b.views, 0);
  const totalVisible = rows.reduce((a, b) => a + b.views_visible, 0);
  const hasData = rows.length > 0 && totalViews > 0;

  return (
    <section className="ppa">
      <div className="ppa-overline mono">ПОКАЗОВ · {DAYS} ДНЕЙ</div>
      {hasData ? (
        <div className="ppa-count-row">
          <div className="ppa-count mono">{totalVisible.toLocaleString('ru-RU')}</div>
          <div className="ppa-count-cap mono">видимых · из {totalViews.toLocaleString('ru-RU')} рендеров</div>
        </div>
      ) : (
        <div className="ppa-empty">Показов пока нет — появятся, когда промо начнут показывать.</div>
      )}
      <style>{PPA_CSS}</style>
    </section>
  );
}

const PPA_CSS = `
.ppa {
  background: linear-gradient(180deg, #faf9f7 0%, #f6f5f3 100%);
  border: 1px solid #dfd1b4;
  border-radius: 20px; padding: 18px 24px;
  display: flex; flex-direction: column; gap: 8px;
}
.ppa .mono { font-family: var(--font-mono); }
.ppa-overline { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: var(--app-fg3); }
.ppa-count-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ppa-count {
  font-size: 30px; font-weight: 700; color: var(--app-fg1);
  font-variant-numeric: tabular-nums; line-height: 1.05;
}
.ppa-count-cap { font-size: 12px; color: var(--app-fg3); }
.ppa-empty {
  color: var(--app-fg3); font-size: 13px;
  background: #fff; border: 1px dashed var(--app-border2);
  border-radius: 10px; padding: 14px; text-align: center;
}
`;
