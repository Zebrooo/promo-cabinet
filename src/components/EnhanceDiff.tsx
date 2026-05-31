'use client';
import { useMemo, useState } from 'react';
import type { AiSuggestions } from '@/lib/ai-client';

/** Patch the editor applies when the user accepts a suggestion. */
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

/**
 * Side-by-side diff of the current draft against the AI's suggestions, with
 * per-field Принять / Отклонить. Stateless about the form values themselves
 * — accept/reject are reported to the parent so it owns the source of truth.
 */
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
  // Build the candidate rows: only fields the model actually changed.
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
      out.push({ field: 'actionLabel', label: 'CTA', current: current.action?.label ?? '', suggested: suggestedLabel });
    }
    return out;
  }, [current, suggestions]);

  // Rows still pending a decision. Removing one closes the panel when empty.
  const [pending, setPending] = useState<DiffRow[]>(initialRows);

  function accept(row: DiffRow) {
    onAccept(row.field === 'actionLabel'
      ? { actionLabel: row.suggested }
      : { [row.field]: row.suggested });
    drop(row);
  }
  function reject(row: DiffRow) {
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
    <div className="form-panel" data-testid="enhance-diff">
      <div className="panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>
          ✨ Предложения AI
          {cacheHit && <span className="hint" style={{ marginLeft: 8 }}>из кэша</span>}
          {model && <span className="hint" style={{ marginLeft: 8 }}>· {model}</span>}
        </h3>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Закрыть</button>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {initialRows.length === 0 ? (
          <p className="hint">AI не нашёл, что улучшить — всё хорошо.</p>
        ) : pending.length === 0 ? (
          <p className="hint">Все предложения обработаны.</p>
        ) : pending.map((row) => (
          <div key={row.field} className="ai-diff-row" style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-fg2, #555)' }}>
              {row.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ padding: '8px 10px', background: '#f6f6f7', borderRadius: 6, fontSize: 13 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Сейчас</div>
                {row.current || <em style={{ color: '#999' }}>(пусто)</em>}
              </div>
              <div style={{ padding: '8px 10px', background: '#ecfdf5', borderRadius: 6, fontSize: 13 }}>
                <div style={{ fontSize: 11, color: '#047857', marginBottom: 2 }}>Предлагается</div>
                {row.suggested}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={() => accept(row)}>Принять</button>
              <button type="button" className="btn btn-secondary" onClick={() => reject(row)}>Отклонить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
