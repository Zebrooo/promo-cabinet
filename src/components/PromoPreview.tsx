'use client';
import { PromoProvider, PromoRenderer, type Advertisement } from 'promo-renderer';
import type { Promo } from '@/lib/schema';

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
  return (
    <div className="preview-panel">
      <PromoProvider config={{ navigate: (_href: string) => {} }}>
        <PromoRenderer ad={toAd(promo)} />
      </PromoProvider>
    </div>
  );
}
