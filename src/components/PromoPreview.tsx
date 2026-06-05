'use client';
import { useState } from 'react';
import { PromoProvider, PromoRenderer, type Advertisement } from '@zebrooo/promo-renderer';
import type { Promo } from '@/lib/schema';

const noop = (_href: string) => {};

/** Formats that render as a full-viewport portal overlay (and lock page scroll). */
const OVERLAY_FORMATS = new Set<Promo['format']>(['popup', 'fullscreen']);

/** Map an in-progress promo to the renderer's Advertisement subset.
 *  Правило фона: image ⊃ gradient ⊃ color. Если есть более «сильный»
 *  источник — слабые игнорируются, иначе preview покажет цвет которого
 *  на проде не будет видно (image его перекроет). Это даёт parity
 *  с abkhaz-auto где та же нормализация в lib/promo.ts. */
function toAd(p: Promo): Advertisement {
  const hasImage = typeof p.backgroundImage === 'string' && p.backgroundImage.trim() !== '';
  return {
    id: p.id || 'preview',
    format: p.format,
    title: p.title,
    description: p.description,
    imageUrl: p.imageUrl,
    action: p.action,
    dismissible: p.dismissible,
    backgroundColor: hasImage ? undefined : p.backgroundColor,
    textColor: p.textColor,
    backgroundImage: p.backgroundImage,
  };
}

export function PromoPreview({ promo }: { promo: Promo }) {
  // Bumping the key remounts the overlay so it can be reopened after being closed.
  const [openKey, setOpenKey] = useState(0);

  if (!promo.title) {
    return <div className="preview-hint">Заполните заголовок, чтобы увидеть превью.</div>;
  }

  const ad = toAd(promo);

  // popup/fullscreen render as full-viewport portal overlays that lock page scroll, so
  // they are opened on demand instead of auto-mounting (which would freeze the cabinet).
  // Closing the overlay (× or Esc) releases the scroll lock.
  if (OVERLAY_FORMATS.has(promo.format)) {
    return (
      <div className="preview-panel">
        <p className="preview-note">
          Формат «{promo.format}» открывается поверх страницы. Закрыть — крестик или Esc.
        </p>
        <button type="button" className="btn" onClick={() => setOpenKey((k) => k + 1)}>
          Показать превью
        </button>
        {openKey > 0 && (
          <PromoProvider key={openKey} config={{ navigate: noop }}>
            <PromoRenderer ad={ad} />
          </PromoProvider>
        )}
      </div>
    );
  }

  // inline/topline render in flow — safe to show live.
  return (
    <div className="preview-panel">
      <PromoProvider config={{ navigate: noop }}>
        <PromoRenderer ad={ad} />
      </PromoProvider>
    </div>
  );
}
