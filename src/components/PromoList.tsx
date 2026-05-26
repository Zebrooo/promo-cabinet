'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

/** Case-insensitive substring match over id, title, internal name and format. */
function matches(p: Promo, q: string): boolean {
  return [p.id, p.title, p.name, p.format].some((field) => field.toLowerCase().includes(q));
}

interface PromoListProps {
  promos: Promo[];
  /** queue names each promo belongs to: Record<promoId, queueName[]> */
  membership: Record<string, string[]>;
  /** all available queue names for the enqueue picker */
  queueNames: string[];
}

export function PromoList({ promos, membership, queueNames }: PromoListProps) {
  const router = useRouter();
  const [list, setList] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  /** per-promo selected queue for the enqueue picker */
  const [pickedQueue, setPickedQueue] = useState<Record<string, string>>({});

  const q = query.trim().toLowerCase();
  const visible = q ? list.filter((p) => matches(p, q)) : list;

  async function enqueue(promoId: string) {
    const queueName = pickedQueue[promoId] ?? queueNames[0];
    if (!queueName) return;
    setBusy(true);
    try {
      await fetch(`/api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(promoId)}`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeForever(id: string) {
    if (!confirm(`Удалить промо "${id}" совсем? Это уберёт его из всех очередей и из хранилища.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setList((cur) => cur.filter((p) => p.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="list-toolbar">
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по id, заголовку, названию, формату…"
          aria-label="Поиск по каталогу промо"
        />
        <span className="list-toolbar__count">{visible.length} из {list.length}</span>
      </div>
      {visible.length === 0 ? (
        <div className="empty">Ничего не найдено по запросу «{query}».</div>
      ) : (
        <div className="cards">
          {visible.map((p) => {
            const queuesIn = membership[p.id] ?? [];
            const selectedQ = pickedQueue[p.id] ?? queueNames[0] ?? '';
            return (
              <article className="card" key={p.id}>
                <div className="card__top">
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', flex: 1 }}>
                    {queuesIn.length > 0
                      ? queuesIn.map((qn) => (
                          <span key={qn} className="pill pill--on">{qn}</span>
                        ))
                      : <span className="pill pill--off">в пуле</span>}
                  </div>
                  <span className="tag">{p.format}</span>
                </div>
                <h3 className="card__title">{p.title}</h3>
                <p className="card__id">{p.id}</p>
                <dl className="card__meta">
                  <div><dt>Активен сейчас</dt><dd>{isActive(p) ? 'да' : 'нет'}</dd></div>
                  <div><dt>Лимит</dt><dd>{p.maxImpressionsPerUser || '∞'}</dd></div>
                </dl>
                {queueNames.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <select
                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
                      value={selectedQ}
                      onChange={(e) => setPickedQueue((cur) => ({ ...cur, [p.id]: e.target.value }))}
                    >
                      {queueNames.map((qn) => (
                        <option key={qn} value={qn}>{qn}</option>
                      ))}
                    </select>
                    <button
                      disabled={busy || queuesIn.includes(selectedQ)}
                      onClick={() => enqueue(p.id)}
                      title={queuesIn.includes(selectedQ) ? 'Уже в этой очереди' : 'Добавить в очередь'}
                    >
                      В очередь
                    </button>
                  </div>
                )}
                <div className="card__actions">
                  <button onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}>Изменить</button>
                  <button className="btn--danger" disabled={busy} onClick={() => removeForever(p.id)}>Удалить совсем</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
