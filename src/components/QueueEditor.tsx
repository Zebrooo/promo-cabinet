'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Promo } from '@/lib/schema';

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
}

export function QueueEditor({ name, persist: initialPersist, promos: initialPromos, poolPromos }: QueueEditorProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Promo[]>(initialPromos);
  const [persist, setPersist] = useState(initialPersist);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState('');

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span className={`pill ${persist ? 'pill--on' : 'pill--off'}`}>
          {persist ? 'persist вкл' : 'persist выкл'}
        </span>
        <button disabled={busy} onClick={togglePersist}>
          {persist ? 'Выключить persist' : 'Включить persist'}
        </button>
      </div>

      {order.length === 0 ? (
        <div className="empty">Очередь пуста — добавьте промо из пула ниже.</div>
      ) : (
        <ol className="queue">
          {order.map((p, i) => (
            <li className="qrow" key={p.id}>
              <span className="qrow__pos">{i + 1}</span>
              <div className="qrow__main">
                <span className="qrow__title">{p.title}</span>
                <span className="qrow__id">{p.id}</span>
              </div>
              <span className={`pill ${isActive(p) ? 'pill--on' : 'pill--off'}`}>
                {isActive(p) ? 'активен' : 'не активен'}
              </span>
              <span className="tag">{p.format}</span>
              <div className="qrow__move">
                <button className="iconbtn" aria-label="Выше" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="iconbtn" aria-label="Ниже" disabled={busy || i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="iconbtn" aria-label="Убрать из очереди" disabled={busy} onClick={() => dequeue(p.id)}>✕</button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {available.length > 0 && (
        <div className="form-card" style={{ maxWidth: '520px' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Добавить промо</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              style={{ flex: 1 }}
              value={effectiveAddId}
              onChange={(e) => setAddId(e.target.value)}
            >
              {available.map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({p.id})</option>
              ))}
            </select>
            <button className="primary" disabled={busy || !effectiveAddId} onClick={addToQueue}>
              Добавить
            </button>
          </div>
        </div>
      )}

      {available.length === 0 && order.length > 0 && (
        <p className="subnote">Все промо из пула уже в этой очереди.</p>
      )}

      <div>
        <Link href="/cabinet/queues" className="btn">← Все очереди</Link>
      </div>
    </div>
  );
}
