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

export function PromoList({ promos, queuedIds }: { promos: Promo[]; queuedIds: string[] }) {
  const router = useRouter();
  const [queued, setQueued] = useState<Set<string>>(new Set(queuedIds));
  const [list, setList] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = q ? list.filter((p) => matches(p, q)) : list;

  async function enqueue(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/promos/${encodeURIComponent(id)}/queue`, { method: 'POST' });
      setQueued((cur) => new Set(cur).add(id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeForever(id: string) {
    if (!confirm(`Удалить промо "${id}" совсем? Это уберёт его из очереди и из хранилища.`)) return;
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
            const inQueue = queued.has(p.id);
        return (
          <article className="card" key={p.id}>
            <div className="card__top">
              <span className={`pill ${inQueue ? 'pill--on' : 'pill--off'}`}>
                {inQueue ? 'в очереди' : 'в пуле'}
              </span>
              <span className="tag">{p.format}</span>
            </div>
            <h3 className="card__title">{p.title}</h3>
            <p className="card__id">{p.id}</p>
            <dl className="card__meta">
              <div><dt>Активен сейчас</dt><dd>{isActive(p) ? 'да' : 'нет'}</dd></div>
              <div><dt>Лимит</dt><dd>{p.maxImpressionsPerUser || '∞'}</dd></div>
            </dl>
            <div className="card__actions">
              <button onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}>Изменить</button>
              {!inQueue && <button disabled={busy} onClick={() => enqueue(p.id)}>В очередь</button>}
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
