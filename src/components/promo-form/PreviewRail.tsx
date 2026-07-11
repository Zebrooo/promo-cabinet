'use client';
import { useState } from 'react';
import type { Promo } from '@/lib/schema';
import { PromoPreview } from '@/components/PromoPreview';

// Quick reach guess so the preview rail has a number to show. Replace with
// real per-format CTRs once promo_analytics_funnel_by_format has enough data.
function estimateReach(fmt: Promo['format']): number {
  switch (fmt) {
    case 'topline':    return 4200;
    case 'inline':     return 2800;
    case 'popup':      return 1600;
    case 'fullscreen': return 900;
    case 'divkit':     return 1600;  // примерно как popup — JSON может рендериться где угодно
    case 'tooltip':    return 1200;  // anchored bubble, desktop-only
    case 'multistep':  return 900;   // онбординг-визард — примерно как fullscreen
    case 'custom':     return 900;   // host-owned overlay — примерно как multistep
  }
}

/** Preview rail — live <PromoPreview/> + device switcher. `promo` should
 *  already be the sanitized/format-stripped shape (caller passes
 *  toPersisted-shaped data via a try/catch, falling back to raw values while
 *  invalid — see PromoForm.tsx). */
export function PreviewRail({ promo }: { promo: Promo }) {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('mobile');
  return (
    <aside className="editor-rail">
      <div className="prev-panel">
        <div className="prev-overline">ЖИВОЙ ПРЕВЬЮ</div>
        <div className="prev-devices" role="tablist" aria-label="Устройство">
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={device === d}
              className={`prev-device${device === d ? ' on' : ''}`}
              onClick={() => setDevice(d)}
            >
              {d === 'desktop' ? 'Desktop' : d === 'tablet' ? 'Tablet' : 'Mobile'}
            </button>
          ))}
        </div>
        <div className={`prev-frame device-${device}`}>
          <PromoPreview promo={promo} />
        </div>
        <div className="prev-foot">
          <div className="prev-overline">СЛОТ</div>
          <div className="mono prev-slot">{promo.format} · feed-top</div>
          <div className="prev-overline" style={{ marginTop: 14 }}>ОЦЕНКА ОХВАТА</div>
          <div className="prev-reach">~ {estimateReach(promo.format).toLocaleString('ru-RU')} / день</div>
          <div className="prev-reach-sub">на основе 30-дневного трафика</div>
        </div>
      </div>
    </aside>
  );
}
