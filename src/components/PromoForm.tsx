'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';
import { PromoPreview } from './PromoPreview';
import { AiEnhanceButton } from './AiEnhanceButton';
import { EnhanceDiff, type EnhancePatch } from './EnhanceDiff';
import type { AiSuggestions } from '@/lib/ai-client';

const FORMATS = ['topline', 'inline', 'popup', 'fullscreen'] as const;

type Caps = { image: boolean; description: boolean; actionLabel: boolean; dismissible: boolean; colors: boolean; bgImage: boolean };
const CAPS: Record<Promo['format'], Caps> = {
  topline:    { image: false, description: true,  actionLabel: false, dismissible: false, colors: true,  bgImage: false },
  inline:     { image: true,  description: true,  actionLabel: true,  dismissible: false, colors: false, bgImage: false },
  popup:      { image: true,  description: true,  actionLabel: true,  dismissible: true,  colors: true,  bgImage: true  },
  fullscreen: { image: true,  description: true,  actionLabel: true,  dismissible: true,  colors: true,  bgImage: true  },
};

const empty: Promo = {
  id: '', name: '', startsAt: '', endsAt: '', targeting: {},
  cooldownHours: 0, format: 'inline', title: '',
  audience: 'all',
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

/** Comma/space-separated slugs <-> string[]. Empty → undefined. */
function parseSlugList(s: string): string[] | undefined {
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}
function slugListToText(arr?: string[]): string {
  return (arr ?? []).join(', ');
}

/** Reduce a promo to the fields its format uses, so stored data matches the format. */
function sanitize(p: Promo): Promo {
  const c = CAPS[p.format];
  return {
    ...p,
    imageUrl:        c.image       ? p.imageUrl        : undefined,
    description:     c.description ? p.description     : undefined,
    dismissible:     c.dismissible ? p.dismissible     : undefined,
    backgroundColor: c.colors      ? p.backgroundColor : undefined,
    textColor:       c.colors      ? p.textColor       : undefined,
    backgroundImage: c.bgImage     ? p.backgroundImage : undefined,
    action: p.action
      ? (c.actionLabel ? p.action : { href: p.action.href })
      : undefined,
  };
}

/** Maps server error codes to readable Russian messages. */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_promo:        'Проверьте поля: ID, название и заголовок обязательны, а начало показа должно быть раньше окончания.',
  duplicate_id:         'Промо с таким ID уже существует — выберите другой ID.',
  id_mismatch:          'ID промо не совпадает.',
  not_found:            'Промо не найдено.',
  unauthorized:         'Сессия истекла. Войдите снова.',
  catalogue_unavailable:'Хранилище недоступно (S3). Попробуйте ещё раз.',
};

/** Quick client-side check so the user gets a clear message before hitting the API. */
function clientValidate(p: Promo): string | null {
  if (!p.id.trim())    return 'Укажите ID (slug).';
  if (!p.name.trim())  return 'Укажите внутреннее название.';
  if (!p.title.trim()) return 'Укажите заголовок.';
  if (!p.startsAt || !p.endsAt) return 'Укажите начало и окончание показа.';
  if (new Date(p.startsAt).getTime() >= new Date(p.endsAt).getTime()) {
    return 'Начало показа должно быть раньше окончания.';
  }
  return null;
}

export function PromoForm({ initial, mode }: { initial?: Promo; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const [p, setP]       = useState<Promo>(initial ?? empty);
  const [error, setError] = useState('');
  const set = (patch: Partial<Promo>) => setP((cur) => ({ ...cur, ...patch }));
  const setTargeting = (patch: Partial<Promo['targeting']>) =>
    set({ targeting: { ...p.targeting, ...patch } });
  const caps = CAPS[p.format];

  // AI suggestions state — null when no diff is open.
  const [aiResult, setAiResult] = useState<{ suggestions: AiSuggestions; cacheHit: boolean; model: string } | null>(null);

  function applyEnhancePatch(patch: EnhancePatch) {
    setP((cur) => {
      let next: Promo = { ...cur };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.description !== undefined) next.description = patch.description;
      if (patch.actionLabel !== undefined) {
        next = { ...next, action: cur.action?.href ? { href: cur.action.href, label: patch.actionLabel } : cur.action };
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const localError = clientValidate(p);
    if (localError) { setError(localError); return; }
    const body = sanitize(p);
    const url    = mode === 'create' ? '/api/promos' : `/api/promos/${encodeURIComponent(p.id)}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    let res: Response;
    try {
      res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      setError('Сеть недоступна — проверьте соединение и повторите.');
      return;
    }
    if (res.ok) { router.push('/cabinet'); router.refresh(); return; }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(ERROR_MESSAGES[data.error ?? ''] ?? `Не удалось сохранить (ошибка ${res.status}).`);
  }

  return (
    <div className="page-body">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="left">
          <div className="eyebrow">ПРОМО</div>
          <h1>{mode === 'create' ? 'Новое промо' : 'Редактирование'}</h1>
        </div>
        <AiEnhanceButton
          getDraft={() => ({
            title: p.title,
            description: p.description,
            action: p.action,
          })}
          onSuggestions={setAiResult}
        />
      </div>

      {aiResult && (
        <EnhanceDiff
          current={{ title: p.title, description: p.description, action: p.action }}
          suggestions={aiResult.suggestions}
          cacheHit={aiResult.cacheHit}
          model={aiResult.model}
          onAccept={applyEnhancePatch}
          onClose={() => setAiResult(null)}
        />
      )}

      <form onSubmit={submit}>
        {/* ── Two-column grid ──────────────────────────────────── */}
        <div className="form-grid">

          {/* ════ LEFT COLUMN ════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Panel: Основное */}
            <div className="form-panel">
              <div className="panel-head"><h3>Основное</h3></div>
              <div className="panel-body">

                <div className="form-row">
                  <div className="field">
                    <label>ID (slug)</label>
                    <input
                      className="input mono-input"
                      value={p.id}
                      disabled={mode === 'edit'}
                      onChange={(e) => set({ id: e.target.value })}
                      placeholder="summer-sale"
                    />
                  </div>
                  <div className="field">
                    <label>Формат{mode === 'edit' ? ' (нельзя изменить)' : ''}</label>
                    <select
                      className="select"
                      value={p.format}
                      disabled={mode === 'edit'}
                      onChange={(e) => set({ format: e.target.value as Promo['format'] })}
                    >
                      {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Название (внутреннее)</label>
                  <input
                    className="input"
                    value={p.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="Например: Летняя акция 2025"
                  />
                </div>

                <div className="field">
                  <label>Заголовок</label>
                  <input
                    className="input"
                    value={p.title}
                    onChange={(e) => set({ title: e.target.value })}
                    placeholder="Текст, который увидит пользователь"
                  />
                </div>

                {caps.description && (
                  <div className="field">
                    <label>Описание</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={p.description ?? ''}
                      onChange={(e) => set({ description: e.target.value || undefined })}
                      placeholder="Дополнительный текст под заголовком…"
                    />
                  </div>
                )}

              </div>
            </div>

            {/* Panel: Показ */}
            <div className="form-panel">
              <div className="panel-head"><h3>Показ</h3></div>
              <div className="panel-body">

                <div className="form-row">
                  <div className="field">
                    <label>Начало показа</label>
                    <input
                      type="datetime-local"
                      className="input"
                      lang="ru"
                      value={isoToLocalInput(p.startsAt)}
                      onChange={(e) => set({ startsAt: localInputToIso(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label>Окончание показа</label>
                    <input
                      type="datetime-local"
                      className="input"
                      lang="ru"
                      value={isoToLocalInput(p.endsAt)}
                      onChange={(e) => set({ endsAt: localInputToIso(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>Макс. показов на пользователя</label>
                    <input
                      type="number"
                      className="input mono-input"
                      min={1}
                      value={p.maxImpressionsPerUser ?? ''}
                      onChange={(e) =>
                        set({ maxImpressionsPerUser: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                      placeholder="∞"
                    />
                    <span className="hint">Пусто = без лимита</span>
                  </div>
                  <div className="field">
                    <label>Кулдаун, часов</label>
                    <input
                      type="number"
                      className="input mono-input"
                      min={0}
                      value={p.cooldownHours}
                      onChange={(e) => set({ cooldownHours: Number(e.target.value) })}
                      placeholder="0"
                    />
                    <span className="hint">0 = без кулдауна</span>
                  </div>
                </div>

                <div className="field">
                  <label>Аудитория</label>
                  <select
                    className="select"
                    value={p.audience ?? 'all'}
                    onChange={(e) => set({ audience: e.target.value as Promo['audience'] })}
                  >
                    <option value="all">Все</option>
                    <option value="authenticated">Только залогиненные</option>
                    <option value="anonymous">Только гости</option>
                  </select>
                </div>

              </div>
            </div>

            {/* Panel: Таргетинг */}
            <div className="form-panel">
              <div className="panel-head"><h3>Таргетинг</h3></div>
              <div className="panel-body">

                <div className="form-row">
                  <div className="field">
                    <label>Возраст от</label>
                    <input
                      type="number"
                      className="input mono-input"
                      min={0}
                      value={p.targeting.minAge ?? ''}
                      onChange={(e) => setTargeting({ minAge: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—"
                    />
                  </div>
                  <div className="field">
                    <label>Возраст до</label>
                    <input
                      type="number"
                      className="input mono-input"
                      min={0}
                      value={p.targeting.maxAge ?? ''}
                      onChange={(e) => setTargeting({ maxAge: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—"
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Регионы</label>
                  <input
                    className="input mono-input"
                    value={slugListToText(p.targeting.regions)}
                    placeholder="sukhum, gagra"
                    onChange={(e) => setTargeting({ regions: parseSlugList(e.target.value) })}
                  />
                  <span className="hint">Через запятую; пусто = все регионы</span>
                </div>

                <div className="field">
                  <label>Уровни подписки</label>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: 2 }}>
                    {(['none', 'plus', 'premium'] as const).map((lvl) => (
                      <label key={lvl} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', fontWeight: 400, fontSize: 13, color: 'var(--app-fg1)' }}>
                        <input
                          type="checkbox"
                          checked={p.targeting.subscriptionLevels?.includes(lvl) ?? false}
                          onChange={(e) => {
                            const cur  = p.targeting.subscriptionLevels ?? [];
                            const next = e.target.checked ? [...cur, lvl] : cur.filter((x) => x !== lvl);
                            setTargeting({ subscriptionLevels: next.length ? next : undefined });
                          }}
                        />
                        {lvl}
                      </label>
                    ))}
                  </div>
                  <span className="hint">Пусто = любой уровень</span>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label>Разделы</label>
                    <input
                      className="input mono-input"
                      value={slugListToText(p.sections)}
                      placeholder="avto, realty"
                      onChange={(e) => set({ sections: parseSlugList(e.target.value) })}
                    />
                    <span className="hint">Через запятую; пусто = все</span>
                  </div>
                  <div className="field">
                    <label>Категории</label>
                    <input
                      className="input mono-input"
                      value={slugListToText(p.categories)}
                      placeholder="kvartiry"
                      onChange={(e) => set({ categories: parseSlugList(e.target.value) })}
                    />
                    <span className="hint">Через запятую; пусто = все</span>
                  </div>
                </div>

                <div className="field">
                  <label>Кому показывать (по объявлениям)</label>
                  <select
                    className="select"
                    value={p.sellerStatus ?? ''}
                    onChange={(e) =>
                      set({ sellerStatus: e.target.value === '' ? undefined : (e.target.value as 'seller' | 'buyer') })
                    }
                  >
                    <option value="">Всем</option>
                    <option value="seller">Только продавцам (есть объявления)</option>
                    <option value="buyer">Только покупателям (нет объявлений)</option>
                  </select>
                </div>

              </div>
            </div>

            {/* Panel: Оформление */}
            <div className="form-panel">
              <div className="panel-head"><h3>Оформление</h3></div>
              <div className="panel-body">

                {caps.image && (
                  <div className="field">
                    <label>Картинка (URL)</label>
                    <input
                      className="input mono-input"
                      value={p.imageUrl ?? ''}
                      onChange={(e) => set({ imageUrl: e.target.value || undefined })}
                      placeholder="https://…"
                    />
                  </div>
                )}

                <div className="field">
                  <label>{caps.actionLabel ? 'CTA href' : 'Ссылка баннера'}</label>
                  <input
                    className="input mono-input"
                    value={p.action?.href ?? ''}
                    onChange={(e) =>
                      set({
                        action: e.target.value
                          ? { href: e.target.value, label: caps.actionLabel ? p.action?.label : undefined }
                          : undefined,
                      })
                    }
                    placeholder="/sale/summer"
                  />
                  <span className="hint">Необязательно</span>
                </div>

                {caps.actionLabel && (
                  <div className="field">
                    <label>CTA label</label>
                    <input
                      className="input"
                      value={p.action?.label ?? ''}
                      disabled={!p.action?.href}
                      onChange={(e) =>
                        set({
                          action: p.action?.href
                            ? { href: p.action.href, label: e.target.value || undefined }
                            : undefined,
                        })
                      }
                      placeholder="Узнать больше"
                    />
                    <span className="hint">Необязательно; активно только при заполненном href</span>
                  </div>
                )}

                {caps.dismissible && (
                  <div className="toggle-row">
                    <div>
                      <div className="toggle-label">Можно закрыть (×)</div>
                      <div className="toggle-sub">Показывать кнопку закрытия</div>
                    </div>
                    <button
                      type="button"
                      className={`switch${(p.dismissible ?? true) ? ' on' : ''}`}
                      onClick={() => set({ dismissible: !(p.dismissible ?? true) })}
                    />
                  </div>
                )}

                {caps.colors && (
                  <div className="form-row">
                    <div className="field">
                      <label>Цвет фона</label>
                      <input
                        type="color"
                        className="input"
                        style={{ padding: '2px 4px', height: 36, cursor: 'pointer' }}
                        value={p.backgroundColor ?? '#2563eb'}
                        onChange={(e) => set({ backgroundColor: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Цвет текста</label>
                      <input
                        type="color"
                        className="input"
                        style={{ padding: '2px 4px', height: 36, cursor: 'pointer' }}
                        value={p.textColor ?? '#ffffff'}
                        onChange={(e) => set({ textColor: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {caps.bgImage && (
                  <div className="field">
                    <label>Фон-картинка (URL)</label>
                    <input
                      className="input mono-input"
                      value={p.backgroundImage ?? ''}
                      onChange={(e) => set({ backgroundImage: e.target.value || undefined })}
                      placeholder="https://…"
                    />
                    <span className="hint">Необязательно</span>
                  </div>
                )}

              </div>

              {/* Error + actions inside the last left panel's footer */}
              {error && <div style={{ padding: '0 16px 12px' }}><p className="error">{error}</p></div>}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">Сохранить</button>
                <button type="button" className="btn btn-secondary" onClick={() => router.push('/cabinet')}>
                  Отмена
                </button>
              </div>
            </div>

          </div>{/* end LEFT */}

          {/* ════ RIGHT COLUMN — Preview ════════════════════════ */}
          <div style={{ position: 'sticky', top: 64 }}>
            <div className="form-panel">
              <div className="panel-head"><h3>Превью</h3></div>
              <div className="panel-body">
                <PromoPreview promo={sanitize(p)} />
              </div>
            </div>
          </div>

        </div>{/* end form-grid */}
      </form>
    </div>
  );
}
