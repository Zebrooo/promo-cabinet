'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

export function PromoList({ promos, queuedIds }: { promos: Promo[]; queuedIds: string[] }) {
  const router = useRouter();
  const [queued, setQueued] = useState<Set<string>>(new Set(queuedIds));
  const [list, setList] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);

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
    <div className="cards">
      {list.map((p) => {
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
  );
}
