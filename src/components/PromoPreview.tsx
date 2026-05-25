'use client';
import { PromoProvider, PromoRenderer, type Advertisement } from 'promo-renderer';
import type { Promo } from '@/lib/schema';

const noop = (_href: string) => {};

/** Map an in-progress promo to the renderer's Advertisement subset. */
function toAd(p: Promo): Advertisement {
  return {
    id: p.id || 'preview',
    format: p.format,
    title: p.title,
    description: p.description,
    imageUrl: p.imageUrl,
    action: p.action,
    dismissible: p.dismissible,
  };
}

export function PromoPreview({ promo }: { promo: Promo }) {
  if (!promo.title) {
    return <div className="preview-hint">Заполните заголовок, чтобы увидеть превью.</div>;
  }
  // NOTE: popup/fullscreen render as portal overlays via PromoRenderer — intentional,
  // so the preview shows the real renderer output. The preview-panel does not confine them.
  return (
    <div className="preview-panel">
      <PromoProvider config={{ navigate: noop }}>
        <PromoRenderer ad={toAd(promo)} />
      </PromoProvider>
    </div>
  );
}
