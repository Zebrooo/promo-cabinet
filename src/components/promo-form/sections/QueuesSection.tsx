'use client';
import { useState, useTransition } from 'react';
import { QUEUE_META } from '@/lib/queue-formats';

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

  // Очередь без потребителя (QUEUE_META.legacy) молча съедает промо: витрина
  // её не запрашивает, показов не будет и ошибки тоже. Помечаем прямо в чипе,
  // а если промо стоит ТОЛЬКО в таких — предупреждаем текстом.
  const deadSelected = [...memberSet].filter((qn) => QUEUE_META[qn]?.legacy);
  const onlyDead = memberSet.size > 0 && deadSelected.length === memberSet.size;

  return (
    <section className="ef-block">
      <div className="ef-label">ОЧЕРЕДИ ПОКАЗА</div>
      <div className="ef-queues">
        {queueNames.map((qn) => {
          const inQ = memberSet.has(qn);
          const dead = QUEUE_META[qn]?.legacy === true;
          return (
            <button
              key={qn}
              type="button"
              className={`qchip${inQ ? ' on' : ''}${dead ? ' qchip-dead' : ''}`}
              onClick={() => toggleQueue(qn)}
              disabled={mode === 'create' || queueBusy}
              aria-pressed={inQ}
              title={dead ? QUEUE_META[qn]?.sectionHint : undefined}
            >
              {qn}
              {dead && <span className="qchip-dead-mark" aria-hidden>не читается</span>}
            </button>
          );
        })}
      </div>
      {onlyDead && (
        <div className="hint hint-warn">
          Промо стоит только в очередях, которые витрина не запрашивает, — показов не будет.
          Для каталога добавьте очередь с суффиксом устройства («Транспорт · веб» и т. п.).
        </div>
      )}
      {mode === 'create' && <div className="hint">Сначала сохрани промо, потом добавляй в очереди.</div>}
    </section>
  );
}
