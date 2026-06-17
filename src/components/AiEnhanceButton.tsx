'use client';
// «✨ Улучшить с AI» — кнопка-аксент в action-bar редактора. Берёт черновик
// (title + description + action.label) → POST /api/enhance → BFF /enhance-promo
// → OpenRouter gpt-4o-mini. Возвращает suggestions родителю (PromoForm), тот
// показывает <EnhanceDiff/> с per-field accept/reject.
//
// Скоп AI: только тексты — title, description, action.label.
// Всё остальное (формат, очереди, даты, таргетинг, картинка, ссылка) НЕ
// отправляется и НЕ переписывается. Кнопка визуально подчёркнута coral
// градиентом, чтобы не теряться рядом с «Сохранить» / «Опубликовать».

import { useState } from 'react';
import { describeAiReason, enhancePromo, type AiClientDraft, type AiSuggestions } from '@/lib/ai-client';

const HINT = 'AI прочитает заголовок и описание, перепишет их и предложит CTA-надпись. Другие поля не используются.';

export function AiEnhanceButton({
  getDraft,
  onSuggestions,
  className,
}: {
  getDraft: () => AiClientDraft;
  onSuggestions: (result: { suggestions: AiSuggestions; cacheHit: boolean; model: string }) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function hasAnyText(d: AiClientDraft): boolean {
    return Boolean(
      (d.title && d.title.trim()) ||
      (d.description && d.description.trim()) ||
      (d.action?.label && d.action.label.trim()),
    );
  }

  async function onClick() {
    setError('');
    const draft = getDraft();
    if (!hasAnyText(draft)) {
      setError('Сначала напиши черновой заголовок — AI его перепишет.');
      return;
    }
    setBusy(true);
    try {
      const result = await enhancePromo(draft);
      if (!result.ok) {
        setError(describeAiReason(result.reason));
        return;
      }
      onSuggestions({ suggestions: result.suggestions, cacheHit: result.cacheHit, model: result.model });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <button
        type="button"
        className="ebtn ebtn-ai"
        disabled={busy}
        onClick={onClick}
        title={HINT}
        aria-label="Улучшить тексты с помощью AI"
        data-track="ai_enhance_click"
      >
        <span className="ebtn-ai-spark" aria-hidden>✨</span>
        <span>{busy ? 'Улучшаем…' : 'Улучшить с AI'}</span>
      </button>
      {error && <span className="ebtn-ai-error">{error}</span>}
    </div>
  );
}
