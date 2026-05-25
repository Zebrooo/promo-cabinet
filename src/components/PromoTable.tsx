'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

export function PromoTable({ promos }: { promos: Promo[] }) {
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
    await fetch('/api/promos/reorder', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm(`Удалить промо "${id}"?`)) return;
    setBusy(true);
    await fetch(`/api/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setOrder((cur) => cur.filter((p) => p.id !== id));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="queue-wrap">
      <table>
        <thead>
          <tr>
            <th>№</th><th>Промо</th><th>Формат</th><th>Статус</th>
            <th>Лимит</th><th>Кулд., ч</th><th>Очередь</th><th></th>
          </tr>
        </thead>
        <tbody>
          {order.map((p, i) => (
            <tr key={p.id}>
              <td><span className="qpos">{i + 1}</span></td>
              <td className="title-cell">
                {p.title}
                <small>{p.id}</small>
              </td>
              <td><span className="tag">{p.format}</span></td>
              <td>
                <span className={`pill ${isActive(p) ? 'pill--on' : 'pill--off'}`}>
                  {isActive(p) ? 'активен' : 'не активен'}
                </span>
              </td>
              <td><span className={`num ${p.maxImpressionsPerUser ? '' : 'num--inf'}`}>{p.maxImpressionsPerUser || '∞'}</span></td>
              <td><span className="num">{p.cooldownHours}</span></td>
              <td className="row">
                <button className="iconbtn" aria-label="Выше" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="iconbtn" aria-label="Ниже" disabled={busy || i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
              </td>
              <td className="row actions">
                <button onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}>Изменить</button>
                <button className="btn--danger" disabled={busy} onClick={() => remove(p.id)}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
