'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Promo } from '@/lib/schema';
import { formatName } from '@/lib/format-labels';
import { QUEUE_META, isFormatMismatch } from '@/lib/queue-formats';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

interface QueueEditorProps {
  name: string;
  persist: boolean;
  /** Promos currently in this queue, in order */
  promos: Promo[];
  /** All pool promos (for the add-picker) */
  poolPromos: Promo[];
  /** Ids the queue file references but the pool no longer contains. Shown
   *  as a yellow warning + one-click cleanup so dead links don't sit silently
   *  in the queue forever (which previously made the storefront return empty
   *  selections with no in-cabinet signal). */
  danglingIds?: string[];
}

/** Grip icon for drag handle (decorative) */
function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="5" cy="4" r="1.2" fill="currentColor"/>
      <circle cx="5" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="5" cy="12" r="1.2" fill="currentColor"/>
      <circle cx="11" cy="4" r="1.2" fill="currentColor"/>
      <circle cx="11" cy="8" r="1.2" fill="currentColor"/>
      <circle cx="11" cy="12" r="1.2" fill="currentColor"/>
    </svg>
  );
}

export function QueueEditor({ name, persist: initialPersist, promos: initialPromos, poolPromos, danglingIds = [] }: QueueEditorProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Promo[]>(initialPromos);
  const [persist, setPersist] = useState(initialPersist);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState('');
  const [dangling, setDangling] = useState<string[]>(danglingIds);
  const [enqueueWarning, setEnqueueWarning] = useState<string | null>(null);

  /** Remove every dangling id from the queue file via DELETE /[name]/[id].
   *  One round-trip per id (the API is per-id and idempotent); usually 0–3
   *  ids in practice, so a single click is fine. */
  async function cleanupDangling() {
    if (dangling.length === 0) return;
    setBusy(true);
    try {
      for (const id of dangling) {
        await fetch(`/api/queues/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      }
      setDangling([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inQueueIds = new Set(order.map((p) => p.id));
  const available = poolPromos.filter((p) => !inQueueIds.has(p.id));

  // Sync addId default when available list changes
  const effectiveAddId = addId && !inQueueIds.has(addId) ? addId : (available[0]?.id ?? '');

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setBusy(true);
    try {
      await fetch(`/api/queues/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function dequeue(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/queues/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setOrder((cur) => cur.filter((p) => p.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addToQueue() {
    const id = effectiveAddId;
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/queues/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; warning?: string };
        if (data.warning) setEnqueueWarning(data.warning);
        const promo = poolPromos.find((p) => p.id === id);
        if (promo) setOrder((cur) => [...cur, promo]);
        setAddId('');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function togglePersist() {
    setBusy(true);
    try {
      await fetch(`/api/queues/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persist: !persist }),
      });
      setPersist((cur) => !cur);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const activeCount = order.filter((p) => isActive(p)).length;

  // Format breakdown for the stats panel — the BFF picks by format inside a
  // queue, so an advertiser must see at a glance which formats the queue can
  // actually serve (a queue without e.g. a popup serves no popup slot).
  const formatCounts = order.reduce<Record<string, number>>((acc, p) => {
    acc[p.format] = (acc[p.format] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">ОЧЕРЕДЬ</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 10 }}>
            {name}
            {QUEUE_META[name]?.legacy && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  background: '#fff3cd',
                  border: '1px solid #d4a017',
                  color: '#7a5a00',
                  borderRadius: 4,
                  padding: '2px 8px',
                  verticalAlign: 'middle',
                }}
                title="Сайт больше не запрашивает эту очередь — промо из неё не будут показаны"
              >
                легаси
              </span>
            )}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${persist ? 'badge-persist' : 'badge-no-persist'}`}>
            {persist ? 'persist' : 'не persist'}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={togglePersist}
          >
            {persist ? 'Выключить persist' : 'Включить persist'}
          </button>
        </div>
      </div>

      {enqueueWarning && (
        <div
          role="alert"
          style={{
            background: '#fef3c7',
            border: '1px solid #d97706',
            borderLeft: '3px solid #d97706',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 13,
            lineHeight: 1.4,
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>⚠ {enqueueWarning}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setEnqueueWarning(null)}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      )}

      <div className="queue-detail-grid">
        {/* LEFT — queue items */}
        <div>
          {QUEUE_META[name]?.legacy && (
            <div
              role="alert"
              style={{
                background: '#fff3cd',
                border: '1px solid #d4a017',
                borderLeft: '3px solid #d4a017',
                borderRadius: 6,
                padding: '10px 12px',
                marginBottom: 12,
                fontSize: 13,
                lineHeight: 1.4,
                color: '#7a5a00',
              }}
            >
              <b>Легаси-очередь:</b> сайт больше не запрашивает <code style={{ background: 'rgba(0,0,0,.06)', padding: '1px 5px', borderRadius: 3 }}>{name}</code> — промо из неё не будут показаны пользователям. Используйте каталожные очереди (home, transport, …).
            </div>
          )}

          {dangling.length > 0 && (
            <div
              role="alert"
              style={{
                background: '#fff8e1',
                border: '1px solid #f0c674',
                borderLeft: '3px solid #d4a017',
                borderRadius: 6,
                padding: '10px 12px',
                marginBottom: 12,
                fontSize: 13,
                lineHeight: 1.4,
                color: '#7a5a00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <b>В очереди есть «висящие» ссылки</b> на промо, которых нет в пуле:{' '}
                <code style={{ background: 'rgba(0,0,0,.06)', padding: '1px 5px', borderRadius: 3 }}>
                  {dangling.join(', ')}
                </code>
                . Сайт их пропускает молча — рекомендуем убрать.
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={cleanupDangling}
                title="Удалить эти id из очереди (промо из пула не трогает)"
              >
                Очистить
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-fg2)' }}>
              Промо в очереди · кнопки для сортировки
            </div>
          </div>

          {order.length === 0 ? (
            <div className="empty">Очередь пуста — добавьте промо из пула ниже.</div>
          ) : (
            <div className="queue-items">
              {order.map((p, i) => (
                <div className="queue-promo-item" key={p.id}>
                  <span className="drag-handle">
                    <GripIcon />
                  </span>
                  <div className="qi-order">{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div className="qi-title">{p.title}</div>
                    <div className="qi-slug">{p.id}</div>
                  </div>
                  <span className={`badge badge-${p.format}`}>{formatName(p.format)}</span>
                  {isFormatMismatch(name, p.format) && (
                    <span
                      title={`Сайт не запрашивает формат «${formatName(p.format)}» из очереди «${name}» — это промо не будет показано`}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#92400e',
                        background: '#fef3c7',
                        border: '1px solid #d97706',
                        borderRadius: 4,
                        padding: '1px 6px',
                        whiteSpace: 'nowrap',
                        cursor: 'help',
                      }}
                    >
                      ⚠ не запрашивается
                    </span>
                  )}
                  <span className={`badge ${isActive(p) ? 'badge-active' : 'badge-inactive'}`}>
                    {isActive(p) ? 'активен' : 'не активен'}
                  </span>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label="Выше"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    title="Выше"
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label="Ниже"
                    disabled={busy || i === order.length - 1}
                    onClick={() => move(i, 1)}
                    title="Ниже"
                  >
                    ↓
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label="Убрать из очереди"
                    disabled={busy}
                    onClick={() => dequeue(p.id)}
                    title="Убрать из очереди"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {available.length > 0 && (
            <div className="form-panel" style={{ maxWidth: 520, marginTop: 16 }}>
              <div className="panel-head"><h3>Добавить промо</h3></div>
              <div className="panel-body">
                <div className="field">
                  <label>Промо из пула</label>
                  <select
                    className="select"
                    value={effectiveAddId}
                    onChange={(e) => setAddId(e.target.value)}
                  >
                    {available.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.format}, {p.id}){isFormatMismatch(name, p.format) ? ' ⚠' : ''}
                      </option>
                    ))}
                  </select>
                  {effectiveAddId && (() => {
                    const selectedPromo = available.find((p) => p.id === effectiveAddId);
                    if (selectedPromo && isFormatMismatch(name, selectedPromo.format)) {
                      return (
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: '#92400e',
                            background: '#fef3c7',
                            border: '1px solid #d97706',
                            borderRadius: 4,
                            padding: '4px 8px',
                          }}
                        >
                          ⚠ Сайт не запрашивает формат «{formatName(selectedPromo.format)}» из очереди «{name}» — промо можно добавить, но оно не будет показано.
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                  disabled={busy || !effectiveAddId}
                  onClick={addToQueue}
                >
                  Добавить
                </button>
              </div>
            </div>
          )}

          {available.length === 0 && order.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--app-fg3)', marginTop: 12 }}>
              Все промо из пула уже в этой очереди.
            </p>
          )}

          <div style={{ marginTop: 16 }}>
            <Link href="/cabinet/queues" className="btn btn-secondary btn-sm">
              ← Все очереди
            </Link>
          </div>
        </div>

        {/* RIGHT — stats panel */}
        <div className="queue-stats" style={{ position: 'sticky', top: 64 }}>
          <div className="qs-head">
            <h3>Сводка</h3>
          </div>
          <div className="qs-body">
            <div className="stat-row">
              <span className="sr-label">Промо в очереди</span>
              <span className="sr-val">{order.length}</span>
            </div>
            <div className="stat-row">
              <span className="sr-label">Активных</span>
              <span className="sr-val">{activeCount}</span>
            </div>
            {Object.entries(formatCounts).map(([format, count]) => (
              <div className="stat-row" key={format}>
                <span className="sr-label">— {formatName(format)}</span>
                <span className="sr-val">{count}</span>
              </div>
            ))}
            <div className="stat-row">
              <span className="sr-label">Persist</span>
              <span className="sr-val">{persist ? 'да' : 'нет'}</span>
            </div>
            <div className="stat-row">
              <span className="sr-label">Доступно в пуле</span>
              <span className="sr-val">{available.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
