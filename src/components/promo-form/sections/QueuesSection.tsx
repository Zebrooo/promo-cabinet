'use client';
import { useState, useTransition } from 'react';

/** Queue membership chips — deliberately NOT Formik state: each toggle is its
 *  own optimistic API call (POST/DELETE /api/queues/:name/:id), independent
 *  of the promo form's save button. Mirrors the monolith's separate
 *  memberSet/queueBusy state exactly. */
export function QueuesSection({
  mode, promoId, queueNames, membership,
}: {
  mode: 'create' | 'edit';
  promoId: string;
  queueNames: string[];
  membership: string[];
}) {
  const [memberSet, setMemberSet] = useState<Set<string>>(() => new Set(membership));
  const [queueBusy, startQueueTransition] = useTransition();

  if (queueNames.length === 0) return null;

  function toggleQueue(name: string) {
    if (mode === 'create' || !promoId) return; // can't toggle before save
    const wasIn = memberSet.has(name);
    // Optimistic toggle
    setMemberSet((cur) => {
      const next = new Set(cur);
      if (wasIn) next.delete(name); else next.add(name);
      return next;
    });
    startQueueTransition(async () => {
      try {
        const url = `/api/queues/${encodeURIComponent(name)}/${encodeURIComponent(promoId)}`;
        const r = await fetch(url, { method: wasIn ? 'DELETE' : 'POST' });
        if (!r.ok) throw new Error('queue toggle failed');
      } catch {
        // Roll back on error
        setMemberSet((cur) => {
          const next = new Set(cur);
          if (wasIn) next.add(name); else next.delete(name);
          return next;
        });
      }
    });
  }

  return (
    <section className="ef-block">
      <div className="ef-label">ОЧЕРЕДИ ПОКАЗА</div>
      <div className="ef-queues">
        {queueNames.map((qn) => {
          const inQ = memberSet.has(qn);
          return (
            <button
              key={qn}
              type="button"
              className={`qchip${inQ ? ' on' : ''}`}
              onClick={() => toggleQueue(qn)}
              disabled={mode === 'create' || queueBusy}
              aria-pressed={inQ}
            >
              {qn}
            </button>
          );
        })}
      </div>
      {mode === 'create' && <div className="hint">Сначала сохрани промо, потом добавляй в очереди.</div>}
    </section>
  );
}
