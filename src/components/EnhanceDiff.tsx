'use client';
// Per-field diff между текущим черновиком и предложениями AI. Stateless: всё
// решение «принять / отклонить» прокидывается наверх в PromoForm.applyEnhancePatch.
// Каждая строка показывает «Сейчас» слева, «AI предлагает» справа + 2 кнопки.
// Когда все строки обработаны — onClose() закрывает панель автоматически.

import { useMemo, useState } from 'react';
import type { AiSuggestions } from '@/lib/ai-client';

export interface EnhancePatch {
  title?: string;
  description?: string;
  /** Suggested CTA label — caller merges into `action.label`. */
  actionLabel?: string;
}

interface DiffRow {
  field: 'title' | 'description' | 'actionLabel';
  label: string;
  current: string;
  suggested: string;
}

export function EnhanceDiff({
  current,
  suggestions,
  cacheHit,
  model,
  onAccept,
  onClose,
}: {
  current: { title?: string; description?: string; action?: { label?: string } };
  suggestions: AiSuggestions;
  cacheHit?: boolean;
  model?: string;
  onAccept: (patch: EnhancePatch) => void;
  onClose: () => void;
}) {
  const initialRows = useMemo<DiffRow[]>(() => {
    const out: DiffRow[] = [];
    if (suggestions.title !== undefined && suggestions.title !== (current.title ?? '')) {
      out.push({ field: 'title', label: 'Заголовок', current: current.title ?? '', suggested: suggestions.title });
    }
    if (suggestions.description !== undefined && suggestions.description !== (current.description ?? '')) {
      out.push({ field: 'description', label: 'Описание', current: current.description ?? '', suggested: suggestions.description });
    }
    const suggestedLabel = suggestions.action?.label;
    if (suggestedLabel !== undefined && suggestedLabel !== (current.action?.label ?? '')) {
      out.push({ field: 'actionLabel', label: 'CTA-надпись', current: current.action?.label ?? '', suggested: suggestedLabel });
    }
    return out;
  }, [current, suggestions]);

  const [pending, setPending] = useState<DiffRow[]>(initialRows);

  function accept(row: DiffRow) {
    onAccept(row.field === 'actionLabel'
      ? { actionLabel: row.suggested }
      : { [row.field]: row.suggested });
    drop(row);
  }
  function drop(row: DiffRow) {
    setPending((cur) => {
      const next = cur.filter((r) => r.field !== row.field);
      if (next.length === 0) onClose();
      return next;
    });
  }

  return (
    <div className="ai-diff" data-testid="enhance-diff">
      <div className="ai-diff-head">
        <div>
          <div className="ai-diff-title">
            <span aria-hidden>✨</span> AI улучшил тексты
          </div>
          <div className="ai-diff-meta mono">
            {model && <span>{model}</span>}
            {cacheHit && <span className="ai-diff-cache">из кэша</span>}
          </div>
        </div>
        <button type="button" className="ebtn ebtn-ghost" onClick={onClose}>Закрыть</button>
      </div>

      <div className="ai-diff-body">
        {initialRows.length === 0 ? (
          <p className="ai-diff-empty">AI не нашёл что улучшить — всё уже хорошо.</p>
        ) : pending.length === 0 ? (
          <p className="ai-diff-empty">Все предложения обработаны.</p>
        ) : pending.map((row) => (
          <div key={row.field} className="ai-diff-row">
            <div className="ai-diff-fieldname">{row.label}</div>
            <div className="ai-diff-grid">
              <div className="ai-diff-cell ai-diff-cur">
                <div className="ai-diff-celllabel">Сейчас</div>
                <div className="ai-diff-celltext">
                  {row.current || <em className="ai-diff-empty-inline">(пусто)</em>}
                </div>
              </div>
              <div className="ai-diff-cell ai-diff-new">
                <div className="ai-diff-celllabel">AI предлагает</div>
                <div className="ai-diff-celltext">{row.suggested}</div>
              </div>
            </div>
            <div className="ai-diff-actions">
              <button type="button" className="ebtn ebtn-primary" onClick={() => accept(row)} data-track="ai_enhance_accept" data-track-field={row.field}>Принять</button>
              <button type="button" className="ebtn ebtn-ghost" onClick={() => drop(row)} data-track="ai_enhance_reject" data-track-field={row.field}>Отклонить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
