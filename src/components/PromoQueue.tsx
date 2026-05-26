'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

export function PromoQueue({ promos }: { promos: Promo[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setBusy(true);
    await fetch('/api/queue', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    });
    setBusy(false);
    router.refresh();
  }

  async function dequeue(id: string) {
    setBusy(true);
    await fetch(`/api/promos/${encodeURIComponent(id)}/queue`, { method: 'DELETE' });
    setOrder((cur) => cur.filter((p) => p.id !== id));
    setBusy(false);
    router.refresh();
  }

  return (
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
  );
}
