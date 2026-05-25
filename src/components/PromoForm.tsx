'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';
import { PromoPreview } from './PromoPreview';

const FORMATS = ['topline', 'inline', 'popup', 'fullscreen'] as const;

type Caps = { image: boolean; description: boolean; actionLabel: boolean; dismissible: boolean };
const CAPS: Record<Promo['format'], Caps> = {
  topline: { image: false, description: true, actionLabel: false, dismissible: true },
  inline: { image: true, description: true, actionLabel: true, dismissible: false },
  popup: { image: true, description: true, actionLabel: true, dismissible: true },
  fullscreen: { image: true, description: true, actionLabel: true, dismissible: true },
};

const empty: Promo = {
  id: '', name: '', startsAt: '', endsAt: '', targeting: {},
  maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: '',
};

/** Stored value is ISO-8601 (UTC). The native picker works in local wall-clock. */
function isoToLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/** Reduce a promo to the fields its format uses, so stored data matches the format. */
function sanitize(p: Promo): Promo {
  const c = CAPS[p.format];
  return {
    ...p,
    imageUrl: c.image ? p.imageUrl : undefined,
    description: c.description ? p.description : undefined,
    dismissible: c.dismissible ? p.dismissible : undefined,
    action: p.action ? (c.actionLabel ? p.action : { href: p.action.href }) : undefined,
  };
}

export function PromoForm({ initial, mode }: { initial?: Promo; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const [p, setP] = useState<Promo>(initial ?? empty);
  const [error, setError] = useState('');
  const set = (patch: Partial<Promo>) => setP((cur) => ({ ...cur, ...patch }));
  const caps = CAPS[p.format];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const body = sanitize(p);
    const url = mode === 'create' ? '/api/promos' : `/api/promos/${encodeURIComponent(p.id)}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) router.push('/cabinet');
    else {
      const data = await res.json().catch(() => ({}));
      setError(`Ошибка: ${data.error ?? res.status}`);
    }
  }

  return (
    <div className="form-layout">
      <form className="form-card" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label>ID (slug)</label>
            <input className="mono-input" value={p.id} disabled={mode === 'edit'} onChange={(e) => set({ id: e.target.value })} placeholder="summer-sale" />
          </div>
          <div className="field">
            <label>Формат{mode === 'edit' ? ' (нельзя изменить)' : ''}</label>
            {/* value is one of FORMATS, which are exactly Promo['format'] */}
            <select value={p.format} disabled={mode === 'edit'} onChange={(e) => set({ format: e.target.value as Promo['format'] })}>
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="field field--full">
            <label>Название (внутреннее)</label>
            <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field field--full">
            <label>Заголовок</label>
            <input value={p.title} onChange={(e) => set({ title: e.target.value })} />
          </div>

          {caps.description && (
            <div className="field field--full">
              <label>Описание</label>
              <textarea value={p.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} />
            </div>
          )}

          {caps.image && (
            <div className="field field--full">
              <label>Картинка (URL)</label>
              <input className="mono-input" value={p.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value || undefined })} placeholder="https://…" />
            </div>
          )}

          <div className="field">
            <label>Начало показа</label>
            <input type="datetime-local" lang="ru" value={isoToLocalInput(p.startsAt)} onChange={(e) => set({ startsAt: localInputToIso(e.target.value) })} />
          </div>
          <div className="field">
            <label>Окончание показа</label>
            <input type="datetime-local" lang="ru" value={isoToLocalInput(p.endsAt)} onChange={(e) => set({ endsAt: localInputToIso(e.target.value) })} />
          </div>

          <div className="field">
            <label>Макс. показов (0 = ∞)</label>
            <input type="number" min={0} value={p.maxImpressionsPerUser} onChange={(e) => set({ maxImpressionsPerUser: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Кулдаун, часов (0 = нет)</label>
            <input type="number" min={0} value={p.cooldownHours} onChange={(e) => set({ cooldownHours: Number(e.target.value) })} />
          </div>

          <div className="field">
            <label>{caps.actionLabel ? 'CTA href (необязательно)' : 'Ссылка баннера (необязательно)'}</label>
            <input className="mono-input" value={p.action?.href ?? ''}
              onChange={(e) => set({ action: e.target.value ? { href: e.target.value, label: caps.actionLabel ? p.action?.label : undefined } : undefined })}
              placeholder="/sale/summer" />
          </div>
          {caps.actionLabel && (
            <div className="field">
              <label>CTA label (необязательно)</label>
              <input value={p.action?.label ?? ''} disabled={!p.action?.href}
                onChange={(e) => set({ action: p.action?.href ? { href: p.action.href, label: e.target.value || undefined } : undefined })} />
            </div>
          )}
          {caps.dismissible && (
            <div className="field">
              <label>Можно закрыть (×)</label>
              <select value={(p.dismissible ?? true) ? 'yes' : 'no'} onChange={(e) => set({ dismissible: e.target.value === 'yes' })}>
                <option value="yes">Да</option>
                <option value="no">Нет</option>
              </select>
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="primary">Сохранить</button>
          <button type="button" onClick={() => router.push('/cabinet')}>Отмена</button>
        </div>
      </form>

      <aside className="preview-aside">
        <p className="kicker">Превью</p>
        <PromoPreview promo={sanitize(p)} />
      </aside>
    </div>
  );
}
