'use client';
import { useState } from 'react';
import type { Promo } from '@/lib/schema';
import { PromoPreview } from '@/components/PromoPreview';

/** Preview rail — live <PromoPreview/> + device switcher. `promo` should
 *  already be the sanitized/format-stripped shape (caller passes
 *  toPreview-shaped data — see PromoForm.tsx). Только то, что мы реально
 *  знаем о промо: никаких оценок охвата и слотов — реальные показы живут в
 *  блоке над формой (PromoAnalyticsBlock), очереди — в секции «Очереди показа». */
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
      </div>
    </aside>
  );
}
