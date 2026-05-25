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
    <table>
      <thead>
        <tr>
          <th>#</th><th>Заголовок</th><th>Формат</th><th>Активен</th>
          <th>Лимит</th><th>Кулдаун, ч</th><th>Порядок</th><th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {order.map((p, i) => (
          <tr key={p.id}>
            <td>{i + 1}</td>
            <td>{p.title}</td>
            <td>{p.format}</td>
            <td>{isActive(p) ? '✓' : '—'}</td>
            <td>{p.maxImpressionsPerUser || '∞'}</td>
            <td>{p.cooldownHours}</td>
            <td className="row">
              <button disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
              <button disabled={busy || i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
            </td>
            <td className="row">
              <button onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}>Изменить</button>
              <button disabled={busy} onClick={() => remove(p.id)}>Удалить</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
