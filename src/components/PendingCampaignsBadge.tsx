'use client';
// Счётчик кампаний, ждущих подтверждения, у пункта меню «Кампании». Опрос раз
// в минуту — тот же ритм, что у поллера BFF; ошибки молча прячут бейдж
// (это подсказка, а не источник правды — он на странице модерации).
import { useEffect, useState } from 'react';

const REFRESH_MS = 60_000;

export function PendingCampaignsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/campaigns', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { pending?: unknown[] };
        if (!cancelled) setCount(Array.isArray(data.pending) ? data.pending.length : 0);
      } catch {
        // сеть/BFF — бейдж просто не обновится
      }
    }
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (count === 0) return null;
  return <span className="nav-badge" aria-label={`${count} кампаний ждут подтверждения`}>{count}</span>;
}
