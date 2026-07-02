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
 *  с abkhaz-auto где та же нормализация в lib/promo.ts.
 *
 *  DivKit: пробрасываем divkitJson (inline) ИЛИ divkitUrl. Renderer
 *  сам разберётся (inline → используется сразу, иначе fetch'ит URL). */
function toAd(p: Promo): Advertisement {
  const hasImage = typeof p.backgroundImage === 'string' && p.backgroundImage.trim() !== '';
  return {
    id: p.id || 'preview',
    // 'multistep' до сюда не доходит (отдельная ветка ниже) — renderer'у
    // известны только его собственные форматы.
    format: p.format as Advertisement['format'],
    title: p.title,
    description: p.description,
    imageUrl: p.imageUrl,
    action: p.action,
    dismissible: p.dismissible,
    backgroundColor: hasImage ? undefined : p.backgroundColor,
    textColor: p.textColor,
    backgroundImage: p.backgroundImage,
    divkitUrl: p.divkitUrl,
    divkitJson: p.divkitJson,
    anchor: p.anchor,
  };
}

export function PromoPreview({ promo }: { promo: Promo }) {
  // Bumping the key remounts the overlay so it can be reopened after being closed.
  const [openKey, setOpenKey] = useState(0);

  // Multistep: рендерер кабинета (0.9.1) этот формат ещё не знает — гейтимся
  // по формату ДО PromoRenderer (иначе console.warn + null) и показываем
  // статический список шагов. После бампа зависимости на 0.10.0 здесь можно
  // будет открывать живой визард пакета.
  if (promo.format === 'multistep') {
    const steps = promo.steps ?? [];
    if (steps.length === 0) {
      return <div className="preview-hint">Добавьте шаги (2–6), чтобы увидеть превью визарда.</div>;
    }
    return (
      <div className="preview-panel">
        <p className="preview-note">
          На сайте — модальный визард: шаги листаются, точки-прогресс, «Далее».
          Шагов: {steps.length}.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {steps.map((st, i) => (
            <li key={i}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{st.title || '—'}</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>{st.body || '—'}</div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // DivKit: визуал диктуется JSON-tree'ом, наш title/desc не используются.
  // Если JSON не вставлен — подсказка, иначе renderer всё нарисует сам.
  if (promo.format === 'divkit') {
    if (!promo.divkitJson && !promo.divkitUrl) {
      return <div className="preview-hint">Вставьте DivKit JSON в форму — превью покажется здесь.</div>;
    }
  } else if (!promo.title) {
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

  // Tooltip points at a host element via data-promo-anchor. The storefront has
  // such an element; in the cabinet we render a sample one so the bubble has an
  // anchor to attach to. Renders in flow (non-blocking, desktop only).
  if (promo.format === 'tooltip') {
    return (
      <div className="preview-panel">
        <p className="preview-note">
          Тултип привязан к якорю «{promo.anchor || '—'}». Превью на образце элемента:
        </p>
        <button
          type="button"
          data-promo-anchor={promo.anchor}
          className="btn"
          style={{ display: 'block', margin: '48px auto' }}
        >
          Образец элемента
        </button>
        <PromoProvider config={{ navigate: noop }}>
          <PromoRenderer ad={ad} />
        </PromoProvider>
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
