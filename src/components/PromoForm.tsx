'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

const FORMATS = ['inline', 'popup', 'fullscreen'] as const;
const empty: Promo = {
  id: '', name: '', startsAt: '', endsAt: '', targeting: {},
  maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: '',
};

export function PromoForm({ initial, mode }: { initial?: Promo; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const [p, setP] = useState<Promo>(initial ?? empty);
  const [error, setError] = useState('');
  const set = (patch: Partial<Promo>) => setP((cur) => ({ ...cur, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const url = mode === 'create' ? '/api/promos' : `/api/promos/${encodeURIComponent(p.id)}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
    if (res.ok) router.push('/cabinet');
    else {
      const data = await res.json().catch(() => ({}));
      setError(`Ошибка: ${data.error ?? res.status}`);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>ID (slug)</label>
      <input value={p.id} disabled={mode === 'edit'} onChange={(e) => set({ id: e.target.value })} />
      <label>Название (внутреннее)</label>
      <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
      <label>Заголовок</label>
      <input value={p.title} onChange={(e) => set({ title: e.target.value })} />
      <label>Описание</label>
      <textarea value={p.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} />
      <label>Картинка (URL)</label>
      <input value={p.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value || undefined })} />
      <label>Начало (ISO 8601)</label>
      <input value={p.startsAt} placeholder="2024-01-01T00:00:00.000Z" onChange={(e) => set({ startsAt: e.target.value })} />
      <label>Конец (ISO 8601)</label>
      <input value={p.endsAt} placeholder="2024-12-31T00:00:00.000Z" onChange={(e) => set({ endsAt: e.target.value })} />
      <label>Формат</label>
      <select value={p.format} onChange={(e) => set({ format: e.target.value as Promo['format'] })}>
        {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <label>Макс. показов на пользователя (0 = без лимита)</label>
      <input type="number" min={0} value={p.maxImpressionsPerUser}
        onChange={(e) => set({ maxImpressionsPerUser: Number(e.target.value) })} />
      <label>Кулдаун, часов (0 = без кулдауна)</label>
      <input type="number" min={0} value={p.cooldownHours}
        onChange={(e) => set({ cooldownHours: Number(e.target.value) })} />
      <label>CTA href (необязательно)</label>
      <input value={p.action?.href ?? ''}
        onChange={(e) => set({ action: e.target.value ? { href: e.target.value, label: p.action?.label } : undefined })} />
      <label>CTA label (необязательно)</label>
      <input value={p.action?.label ?? ''} disabled={!p.action?.href}
        onChange={(e) => set({ action: p.action?.href ? { href: p.action.href, label: e.target.value || undefined } : undefined })} />
      {error && <p className="error">{error}</p>}
      <p className="row">
        <button type="submit">Сохранить</button>
        <button type="button" onClick={() => router.push('/cabinet')}>Отмена</button>
      </p>
    </form>
  );
}
