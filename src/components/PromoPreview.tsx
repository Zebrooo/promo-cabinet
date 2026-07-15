'use client';
import { KNOWN_CUSTOM_VARIANTS } from '@/lib/custom-variants';
import { useState } from 'react';
import { PromoProvider, PromoRenderer, type Advertisement } from '@zebrooo/promo-renderer';
import type { Promo } from '@/lib/schema';
import { FORMAT_LABEL } from '@/lib/format-labels';

const noop = (_href: string) => {};

/** Formats that render as a full-viewport portal overlay (and lock page scroll). */
const OVERLAY_FORMATS = new Set<Promo['format']>(['popup', 'fullscreen', 'multistep']);

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
    format: p.format as Advertisement['format'],
    steps: p.steps,
    presentation: p.presentation,
    title: p.title,
    description: p.description,
    imageUrl: p.imageUrl,
    action: p.action,
    dismissible: p.dismissible,
    backgroundColor: hasImage ? undefined : p.backgroundColor,
    textColor: p.textColor,
    backgroundImage: p.backgroundImage,
    backgroundGradient: p.backgroundGradient,
    divkitUrl: p.divkitUrl,
    divkitJson: p.divkitJson,
    anchor: p.anchor,
  };
}

export function PromoPreview({ promo }: { promo: Promo }) {
  // Bumping the key remounts the overlay so it can be reopened after being closed.
  const [openKey, setOpenKey] = useState(0);

  // Multistep: живой визард пакета (renderer ≥0.10.0). Для рендера пакету
  // нужно ≥2 валидных шагов (validSteps), до того — подсказка вместо пустоты.
  if (promo.format === 'multistep') {
    const validSteps = (promo.steps ?? []).filter((st) => st.title?.trim() && st.body?.trim());
    if (validSteps.length < 2) {
      return <div className="preview-hint">Добавьте минимум 2 заполненных шага (2–6), чтобы открыть живое превью визарда.</div>;
    }
  }

  // Custom: контент рендерит host-компонент (по variant из KNOWN_CUSTOM_VARIANTS),
  // а не renderer/кабинет — живого превью здесь нет. Показываем, какой вариант
  // выбран и где он живёт.
  if (promo.format === 'custom') {
    const v = KNOWN_CUSTOM_VARIANTS.find((x) => x.id === promo.variant);
    if (promo.variant === 'referral-invite') {
      return (
        <div className="preview-hint">
          <p>Вариант «{v?.label}» не рендерит контент на сайте — это конфиг-промо.</p>
          <p>При сохранении promo-bff зеркалит значения ниже в abkhaz-Supabase <code>referral_config</code> (id=1):</p>
          <ul>
            <li>active: {String(promo.referralActive ?? false)}</li>
            <li>inviter_credit_kopecks: {promo.referralInviterCreditKopecks ?? '—'}</li>
            <li>seller_bonus_kopecks: {promo.referralSellerBonusKopecks ?? '—'}</li>
            <li>daily_invite_cap: {promo.referralDailyInviteCap ?? '—'}</li>
            <li>hold_hours: {promo.referralHoldHours ?? '—'}</li>
            <li>daily_budget_kopecks: {promo.dailyBudgetKopecks ?? '—'}</li>
          </ul>
        </div>
      );
    }
    return (
      <div className="preview-hint">
        {v
          ? <>Вариант «{v.label}» — контент рендерит {v.host} на сайте. Превью доступно там, в самом онбординге.</>
          : <>Выберите вариант — контент этого формата задаётся host-компонентом на сайте.</>}
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
          Формат «{FORMAT_LABEL[promo.format].name}» открывается поверх страницы. Закрыть — крестик или Esc.
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
