'use client';
import { useState } from 'react';
import { describeAiReason, enhancePromo, type AiClientDraft, type AiSuggestions } from '@/lib/ai-client';

/**
 * Click-to-improve button. Pulls the current text fields from the form (via
 * `getDraft`), calls `/api/enhance`, and hands the suggestions back to the
 * parent so it can show the diff. Disabled while a request is in flight or
 * when the draft has no improvable text yet.
 */
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
      setError('Заполните заголовок, описание или CTA, чтобы было что улучшать.');
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
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={onClick}
        title="AI перепишет заголовок / описание / CTA и покажет дифф"
      >
        {busy ? 'Улучшаем…' : '✨ Улучшить с AI'}
      </button>
      {error && <span className="hint" style={{ color: '#b91c1c' }}>{error}</span>}
    </div>
  );
}
