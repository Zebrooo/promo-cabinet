'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

export function PromoList({ promos }: { promos: Promo[] }) {
  const router = useRouter();
  const [list, setList] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);

  async function remove(id: string) {
    if (!confirm(`Удалить промо "${id}"?`)) return;
    setBusy(true);
    await fetch(`/api/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setList((cur) => cur.filter((p) => p.id !== id));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="cards">
      {list.map((p) => (
        <article className="card" key={p.id}>
          <div className="card__top">
            <span className={`pill ${isActive(p) ? 'pill--on' : 'pill--off'}`}>
              {isActive(p) ? 'активен' : 'не активен'}
            </span>
            <span className="tag">{p.format}</span>
          </div>
          <h3 className="card__title">{p.title}</h3>
          <p className="card__id">{p.id}</p>
          <dl className="card__meta">
            <div>
              <dt>Лимит</dt>
              <dd>{p.maxImpressionsPerUser || '∞'}</dd>
            </div>
            <div>
              <dt>Кулдаун</dt>
              <dd>{p.cooldownHours} ч</dd>
            </div>
          </dl>
          <div className="card__actions">
            <button onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}>Изменить</button>
            <button className="btn--danger" disabled={busy} onClick={() => remove(p.id)}>Удалить</button>
          </div>
        </article>
      ))}
    </div>
  );
}
