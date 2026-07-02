'use client';
// Promo editor — Figma "03 · Promo editor" port.
//
// Layout:
//   ┌─ sticky page-bar ───────────────────────────────────────┐
//   │ ← Вернуться к списку     [Удалить промо] [Сохранить]    │
//   ├─────────────────────────────────────────────────────────┤
//   │ H1 «Редактирование промо»                                │
//   │ mono caption «ID xxx · обновлено HH:MM»                  │
//   │                                                          │
//   │ ┌─ main editor column ────────┬─ live preview rail ─┐    │
//   │ │ ТИП ПРОМО                   │ ЖИВОЙ ПРЕВЬЮ        │    │
//   │ │ [Inline][Topline][Popup][FS]│ Desktop · Tablet · M │    │
//   │ │                             │ ┌──────────┐         │    │
//   │ │ ЗАГОЛОВОК            28/60  │ │ phone    │         │    │
//   │ │ [....................]      │ │  mock    │         │    │
//   │ │                             │ │          │         │    │
//   │ │ ОПИСАНИЕ                    │ └──────────┘         │    │
//   │ │ [....................]      │                       │    │
//   │ │                             │ СЛОТ                  │    │
//   │ │ ИЗОБРАЖЕНИЕ                 │ topline · feed-top    │    │
//   │ │ [URL]                       │ ОЦЕНКА ОХВАТА         │    │
//   │ │                             │ ~ 4 200 / день        │    │
//   │ │ CTA: [label]  [href]        │                       │    │
//   │ │                             │                       │    │
//   │ │ ОЧЕРЕДИ ПОКАЗА              │                       │    │
//   │ │ [chip][chip][chip][chip]    │                       │    │
//   │ │                             │                       │    │
//   │ │ Расширенные настройки ▾     │                       │    │
//   │ └─────────────────────────────┴───────────────────────┘    │
//   └─────────────────────────────────────────────────────────┘
//
// The right rail is sticky and houses the existing <PromoPreview/>; the
// device switcher above it is decorative for now (the preview always renders
// in mobile-ish layout because that's how the renderer behaves at narrow
// widths). Bottom of the rail shows slot/reach hints once we wire them up.
//
// Advanced settings (ID, internal name, dates, targeting, audience, sections,
// categories, sellerStatus, dismissible, colors, bg image) collapse behind a
// disclosure to keep the primary editing surface uncluttered.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import Link from 'next/link';
import type { Promo } from '@/lib/schema';
import { CANONICAL_ANCHORS } from '@/lib/catalogue';
import { PromoPreview } from './PromoPreview';
import { PromoImageUpload } from './PromoImageUpload';
import { AiEnhanceButton } from './AiEnhanceButton';
import { EnhanceDiff, type EnhancePatch } from './EnhanceDiff';
import type { AiSuggestions } from '@/lib/ai-client';
import { FORMATS_BY_DEVICE, type DeviceClass } from '@zebrooo/promo-renderer';

// Какие форматы доступны для каждого варианта targeting.
// Union (а не intersection): на 'both' оставляем все desktop-форматы — topline
// просто отфильтруется на тач-юзерах в renderer'е (fail-safe null), но
// desktop-юзеры его увидят. Юзер сам осознанно выбирает.
function allowedFormatsFor(target: NonNullable<Promo['deviceTarget']>): readonly Promo['format'][] {
  if (target === 'desktop' || target === 'both') return FORMATS_BY_DEVICE.desktop;
  return FORMATS_BY_DEVICE[target as DeviceClass];
}

// Покажем ли warn у конкретного формата для текущего target. Пока единственный
// случай — topline на target='both' не дойдёт до тач-юзеров.
function formatCaveatFor(format: Promo['format'], target: NonNullable<Promo['deviceTarget']>): string | null {
  if (format === 'topline' && target === 'both') {
    return 'Topline не покажется на мобильных пользователях';
  }
  if (format === 'tooltip' && target === 'both') {
    return 'Tooltip не покажется на мобильных пользователях';
  }
  return null;
}

type Caps = {
  image:       boolean;
  description: boolean;
  actionLabel: boolean;
  dismissible: boolean;
  colors:      boolean;
  bgImage:     boolean;
  /** Поддерживает ли формат backgroundGradient. По просьбе — для всех. */
  gradient:    boolean;
  /** Поддерживает ли формат textAlign (горизонтальное выравнивание). */
  textAlign:   boolean;
  /** Поддерживает ли popupVariant (только popup). */
  variants:    boolean;
  /** Поддерживает ли bullets (split-popup и fullscreen). */
  bullets:     boolean;
};
const CAPS: Record<Promo['format'], Caps> = {
  topline:    { image: false, description: true,  actionLabel: false, dismissible: false, colors: true,  bgImage: false, gradient: true,  textAlign: true,  variants: false, bullets: false },
  inline:     { image: true,  description: true,  actionLabel: true,  dismissible: false, colors: false, bgImage: false, gradient: true,  textAlign: true,  variants: false, bullets: false },
  popup:      { image: true,  description: true,  actionLabel: true,  dismissible: true,  colors: true,  bgImage: true,  gradient: true,  textAlign: true,  variants: true,  bullets: true  },
  fullscreen: { image: true,  description: true,  actionLabel: true,  dismissible: true,  colors: true,  bgImage: true,  gradient: true,  textAlign: true,  variants: false, bullets: true  },
  // DivKit — server-driven UI, всё описано в JSON. Никаких title/colors
  // через нашу форму не имеют значения — JSON диктует визуал сам.
  divkit:     { image: false, description: false, actionLabel: false, dismissible: false, colors: false, bgImage: false, gradient: false, textAlign: false, variants: false, bullets: false },
  // Tooltip — anchored bubble. Supports a thumbnail, description, CTA, ×-close,
  // colours/textAlign. No bg-image/gradient/variants/bullets. The anchor is a
  // separate required field (dropdown), not a CAPS boolean.
  tooltip:    { image: true,  description: true,  actionLabel: true,  dismissible: true,  colors: true,  bgImage: false, gradient: false, textAlign: true,  variants: false, bullets: false },
};

/** Human labels per format. Exported as the single source for format naming
 *  across the cabinet (PromoList filter chips reuse it). */
export const FORMAT_LABEL: Record<Promo['format'], { name: string; sub: string }> = {
  inline:     { name: 'Inline',     sub: 'В ленте' },
  topline:    { name: 'Topline',    sub: 'Над шапкой' },
  popup:      { name: 'Popup',      sub: 'Поверх' },
  fullscreen: { name: 'Fullscreen', sub: 'На весь экран' },
  divkit:     { name: 'DivKit',     sub: 'JSON-верстка' },
  tooltip:    { name: 'Tooltip',    sub: 'Подсказка у элемента' },
};

const empty: Promo = {
  id: '', name: '', startsAt: '', endsAt: '', targeting: {},
  cooldownHours: 0, format: 'inline', title: '',
  audience: 'all',
  deviceTarget: 'both',
};

const TITLE_MAX = 60;

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
function parseSlugList(s: string): string[] | undefined {
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}
function slugListToText(arr?: string[]): string {
  return (arr ?? []).join(', ');
}

function sanitize(p: Promo): Promo {
  const c = CAPS[p.format];
  const isDivkit = p.format === 'divkit';
  return {
    ...p,
    imageUrl:           c.image       ? p.imageUrl           : undefined,
    description:        c.description ? p.description        : undefined,
    dismissible:        c.dismissible ? p.dismissible        : undefined,
    backgroundColor:    c.colors      ? p.backgroundColor    : undefined,
    textColor:          c.colors      ? p.textColor          : undefined,
    backgroundImage:    c.bgImage     ? p.backgroundImage    : undefined,
    backgroundGradient: c.gradient    ? p.backgroundGradient : undefined,
    textAlign:          c.textAlign   ? p.textAlign          : undefined,
    popupVariant:       c.variants    ? p.popupVariant       : undefined,
    bullets:            c.bullets     ? p.bullets            : undefined,
    anchor: p.format === 'tooltip' ? p.anchor : undefined,
    // ctaColor/ctaTextColor имеют смысл только когда есть action
    ctaColor:     p.action && !isDivkit ? p.ctaColor     : undefined,
    ctaTextColor: p.action && !isDivkit ? p.ctaTextColor : undefined,
    action: !isDivkit && p.action
      ? (c.actionLabel ? p.action : { href: p.action.href })
      : undefined,
    // DivKit поля — keep только для divkit формата.
    divkitUrl:  isDivkit ? p.divkitUrl  : undefined,
    divkitJson: isDivkit ? p.divkitJson : undefined,
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_promo:        'Проверьте поля: ID, название и заголовок обязательны, а начало показа должно быть раньше окончания.',
  duplicate_id:         'Промо с таким ID уже существует — выберите другой ID.',
  id_mismatch:          'ID промо не совпадает.',
  not_found:            'Промо не найдено.',
  unauthorized:         'Сессия истекла. Войдите снова.',
  catalogue_unavailable:'Хранилище недоступно (S3). Попробуйте ещё раз.',
};

function clientValidate(p: Promo): string | null {
  if (!p.id.trim())    return 'Укажите ID (slug).';
  if (!p.name.trim())  return 'Укажите внутреннее название.';
  if (!p.title.trim()) return 'Укажите заголовок.';
  if (!p.startsAt || !p.endsAt) return 'Укажите начало и окончание показа.';
  if (new Date(p.startsAt).getTime() >= new Date(p.endsAt).getTime()) {
    return 'Начало показа должно быть раньше окончания.';
  }
  // Санити цепочки: промо не может идти после самого себя (зеркалит refine в schema.ts).
  if (p.afterPromoId && p.afterPromoId.trim() === p.id.trim()) {
    return 'Промо не может показываться после самого себя — укажите id другого промо.';
  }
  return null;
}

export function PromoForm({
  initial, mode, queueNames = [], membership = [], poolPromos = [],
}: {
  initial?: Promo;
  mode: 'create' | 'edit';
  /** All available queues (for the queue-membership chip row). */
  queueNames?: string[];
  /** Names of the queues this promo is currently in. Server-fetched. */
  membership?: string[];
  /** Every promo in the pool (id + title) — feeds the chain <datalist>. */
  poolPromos?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [p, setP] = useState<Promo>(initial ?? empty);
  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiResult, setAiResult] = useState<{ suggestions: AiSuggestions; cacheHit: boolean; model: string } | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('mobile');
  const [memberSet, setMemberSet] = useState<Set<string>>(() => new Set(membership));
  // Цепочка показов: чекбокс включён, если у промо уже задан предшественник.
  const [chainOn, setChainOn] = useState<boolean>(Boolean(initial?.afterPromoId));
  const [queueBusy, startQueueTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (patch: Partial<Promo>) => setP((cur) => ({ ...cur, ...patch }));
  const setTargeting = (patch: Partial<Promo['targeting']>) =>
    set({ targeting: { ...p.targeting, ...patch } });
  const caps = CAPS[p.format];

  // Текущий deviceTarget (по умолчанию 'both' для старых промо без поля).
  const currentTarget: NonNullable<Promo['deviceTarget']> = p.deviceTarget ?? 'both';
  const allowedFormats = useMemo(() => allowedFormatsFor(currentTarget), [currentTarget]);
  // Если юзер переключил deviceTarget и текущий выбранный формат больше не
  // доступен — авто-перекидываем на первый доступный.
  if (!allowedFormats.includes(p.format) && allowedFormats.length > 0) {
    queueMicrotask(() => set({ format: allowedFormats[0] }));
  }

  function applyEnhancePatch(patch: EnhancePatch) {
    setP((cur) => {
      let next: Promo = { ...cur };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.description !== undefined) next.description = patch.description;
      if (patch.actionLabel !== undefined) {
        next = {
          ...next,
          action: cur.action?.href
            ? { href: cur.action.href, label: patch.actionLabel }
            : cur.action,
        };
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const localError = clientValidate(p);
    if (localError) { setError(localError); return; }

    // Если divkit и есть inline JSON — улетаем им в S3, получаем URL,
    // только потом сохраняем промо. Это ровно тот flow что договаривались:
    // S3 пишется только при «Сохранить промо», иначе кабинет держит JSON
    // в state и показывает в preview.
    let toSave: Promo = p;
    if (p.format === 'divkit' && p.divkitJson && !p.divkitUrl) {
      setSaving(true);
      try {
        const r = await fetch('/api/upload-divkit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ json: p.divkitJson, promoId: p.id }),
        });
        const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!r.ok || !j.url) {
          setSaving(false);
          setError(`Не удалось залить DivKit JSON в S3: ${j.error ?? r.status}`);
          return;
        }
        toSave = { ...p, divkitUrl: j.url };
      } catch {
        setSaving(false);
        setError('Сеть недоступна — DivKit JSON не залит в S3.');
        return;
      }
    }

    setSaving(true);
    const body = sanitize(toSave);
    const url    = mode === 'create' ? '/api/promos' : `/api/promos/${encodeURIComponent(p.id)}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    let res: Response;
    try {
      res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      setSaving(false);
      setError('Сеть недоступна — проверьте соединение и повторите.');
      return;
    }
    if (res.ok) {
      trackEvent('promo_save_success', { promo_id: p.id, format: p.format });
      router.push('/cabinet'); router.refresh(); return;
    }
    setSaving(false);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const errKey = data.error ?? '';
    trackEvent('promo_save_failed', { reason: errKey.slice(0, 120) });
    setError(ERROR_MESSAGES[errKey] ?? `Не удалось сохранить (ошибка ${res.status}).`);
  }

  function toggleQueue(name: string) {
    if (mode === 'create' || !p.id) return; // can't toggle before save
    const wasIn = memberSet.has(name);
    // Optimistic toggle
    setMemberSet((cur) => {
      const next = new Set(cur);
      if (wasIn) next.delete(name); else next.add(name);
      return next;
    });
    startQueueTransition(async () => {
      try {
        const url = `/api/queues/${encodeURIComponent(name)}/${encodeURIComponent(p.id)}`;
        const r = await fetch(url, { method: wasIn ? 'DELETE' : 'POST' });
        if (!r.ok) throw new Error('queue toggle failed');
      } catch {
        // Roll back on error
        setMemberSet((cur) => {
          const next = new Set(cur);
          if (wasIn) next.add(name); else next.delete(name);
          return next;
        });
      }
    });
  }

  /** DELETE /api/promos/[id] — the handler also removes the id from every
   *  queue, so no separate queue cleanup is needed here. */
  async function deletePromo() {
    if (mode !== 'edit' || !p.id) return;
    if (!confirm(`Удалить промо «${p.title || p.id}»? Оно будет убрано из всех очередей.`)) return;
    setError('');
    setDeleting(true);
    let res: Response;
    try {
      res = await fetch(`/api/promos/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    } catch {
      setDeleting(false);
      setError('Сеть недоступна — проверьте соединение и повторите.');
      return;
    }
    if (res.ok) {
      trackEvent('promo_delete_success', { promo_id: p.id, format: p.format });
      router.push('/cabinet'); router.refresh(); return;
    }
    setDeleting(false);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(ERROR_MESSAGES[data.error ?? ''] ?? `Не удалось удалить (ошибка ${res.status}).`);
  }

  const titleLen = p.title.length;
  const titleOver = titleLen > TITLE_MAX;
  const updatedNow = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <form onSubmit={submit} className="editor">
      {/* ── Sticky action bar ──────────────────────────────────── */}
      <div className="editor-bar">
        <Link href="/cabinet" className="editor-back">← Вернуться к списку</Link>
        <div className="editor-actions">
          {mode === 'edit' && (
            <button
              type="button"
              className="ebtn ebtn-danger"
              disabled={saving || deleting}
              onClick={deletePromo}
              data-track="promo_delete"
              data-track-id={p.id}
            >
              {deleting ? 'Удаляю…' : 'Удалить промо'}
            </button>
          )}
          <AiEnhanceButton
            getDraft={() => ({ title: p.title, description: p.description, action: p.action })}
            onSuggestions={setAiResult}
          />
          {/* Черновиков нет: каждый save уходит в S3 и попадает в прод в
              пределах 15-секундного TTL BFF-кэша — поэтому одна честная
              кнопка вместо пары «черновик/опубликовать». */}
          <button
            type="submit"
            className="ebtn ebtn-primary"
            disabled={saving || deleting}
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* ── Page heading ───────────────────────────────────────── */}
      <header className="editor-head">
        <h1>{mode === 'create' ? 'Новое промо' : 'Редактирование промо'}</h1>
        <div className="editor-meta mono">
          {mode === 'edit'
            ? `ID ${p.id} · обновлено ${updatedNow}`
            : 'Заполните поля и сохраните'}
        </div>
      </header>

      {aiResult && (
        <div className="editor-ai">
          <EnhanceDiff
            current={{ title: p.title, description: p.description, action: p.action }}
            suggestions={aiResult.suggestions}
            cacheHit={aiResult.cacheHit}
            model={aiResult.model}
            onAccept={applyEnhancePatch}
            onClose={() => setAiResult(null)}
          />
        </div>
      )}

      {/* ── Main editor + preview rail ─────────────────────────── */}
      <div className="editor-grid">
        <div className="editor-main">

          {/* Device target — выбирается ПЕРВЫМ, потому что определяет, какие
              форматы доступны ниже. На touch popup рендерится как bottom-sheet,
              topline вообще не показывается. */}
          <section className="ef-block">
            <div className="ef-label">ГДЕ ПОКАЗЫВАТЬ</div>
            <div className="device-target">
              {([
                { v: 'both',    label: 'Везде',        sub: 'десктоп + мобиль' },
                { v: 'desktop', label: 'Только десктоп', sub: 'все форматы' },
                { v: 'touch',   label: 'Только мобиль',  sub: 'без topline' },
              ] as const).map((opt) => {
                const active = currentTarget === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    className={`dt-pill${active ? ' active' : ''}`}
                    onClick={() => set({ deviceTarget: opt.v })}
                    aria-pressed={active}
                    disabled={mode === 'edit'}
                  >
                    <span className="dt-pill-name">{opt.label}</span>
                    <span className="dt-pill-sub">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
            {mode === 'edit' && <div className="hint">Целевое устройство нельзя изменить после создания.</div>}
          </section>

          {/* Format tiles — фильтруются по deviceTarget */}
          <section className="ef-block">
            <div className="ef-label">ТИП ПРОМО</div>
            <div className="format-tiles">
              {allowedFormats.map((f) => {
                const active = p.format === f;
                const meta = FORMAT_LABEL[f];
                return (
                  <button
                    key={f}
                    type="button"
                    className={`fmt-tile${active ? ' active' : ''}`}
                    onClick={() => set({ format: f })}
                    disabled={mode === 'edit'}
                    aria-pressed={active}
                  >
                    <span className="fmt-tile-glyph" aria-hidden />
                    <span className="fmt-tile-name">{meta.name}</span>
                    <span className="fmt-tile-sub">{meta.sub}</span>
                  </button>
                );
              })}
            </div>
            {mode === 'edit' && <div className="hint">Формат нельзя изменить после создания.</div>}
            {currentTarget === 'touch' && (
              <div className="hint">На мобиле popup открывается шторкой снизу.</div>
            )}
            {formatCaveatFor(p.format, currentTarget) && (
              <div className="hint hint-warn">{formatCaveatFor(p.format, currentTarget)}</div>
            )}
          </section>

          {/* Tooltip anchor — required when format=tooltip */}
          {p.format === 'tooltip' && (
            <section className="ef-block">
              <div className="ef-label">ЯКОРЬ</div>
              <select
                className="ef-input"
                value={p.anchor ?? ''}
                onChange={(e) => set({ anchor: e.target.value || undefined })}
              >
                <option value="">Выберите якорь…</option>
                {CANONICAL_ANCHORS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
              {!p.anchor && (
                <div className="hint hint-warn">Выберите элемент, у которого появится тултип.</div>
              )}
            </section>
          )}

          {/* Title */}
          <section className="ef-block">
            <div className="ef-label-row">
              <div className="ef-label">ЗАГОЛОВОК</div>
              <div className={`ef-counter mono${titleOver ? ' over' : ''}`}>{titleLen} / {TITLE_MAX}</div>
            </div>
            <input
              className="ef-input title"
              value={p.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Что увидит пользователь"
              maxLength={TITLE_MAX + 20}
            />
          </section>

          {/* Description */}
          {caps.description && (
            <section className="ef-block">
              <div className="ef-label">ОПИСАНИЕ</div>
              <textarea
                className="ef-input ef-textarea"
                rows={3}
                value={p.description ?? ''}
                onChange={(e) => set({ description: e.target.value || undefined })}
                placeholder="Дополнительный текст под заголовком"
              />
            </section>
          )}

          {/* Image */}
          {caps.image && (
            <section className="ef-block">
              <div className="ef-label">ИЗОБРАЖЕНИЕ</div>
              <PromoImageUpload
                value={p.imageUrl ?? ''}
                onChange={(url) => set({ imageUrl: url || undefined })}
                label="Картинка карточки"
                recommend={recommendForFormat(p.format)}
                format={p.format}
              />
            </section>
          )}

          {/* CTA */}
          <section className="ef-block">
            <div className="ef-label">CTA</div>
            <div className="ef-cta-row">
              {caps.actionLabel && (
                <input
                  className="ef-input"
                  value={p.action?.label ?? ''}
                  disabled={!p.action?.href}
                  onChange={(e) =>
                    set({
                      action: p.action?.href
                        ? { href: p.action.href, label: e.target.value || undefined }
                        : undefined,
                    })
                  }
                  placeholder="Подробнее"
                />
              )}
              <input
                className="ef-input mono"
                value={p.action?.href ?? ''}
                onChange={(e) =>
                  set({
                    action: e.target.value
                      ? { href: e.target.value, label: caps.actionLabel ? p.action?.label : undefined }
                      : undefined,
                  })
                }
                placeholder="https://abkhaz-auto.ru/…"
              />
            </div>
          </section>

          {/* Queue chips */}
          {queueNames.length > 0 && (
            <section className="ef-block">
              <div className="ef-label">ОЧЕРЕДИ ПОКАЗА</div>
              <div className="ef-queues">
                {queueNames.map((qn) => {
                  const inQ = memberSet.has(qn);
                  return (
                    <button
                      key={qn}
                      type="button"
                      className={`qchip${inQ ? ' on' : ''}`}
                      onClick={() => toggleQueue(qn)}
                      disabled={mode === 'create' || queueBusy}
                      aria-pressed={inQ}
                    >
                      {qn}
                    </button>
                  );
                })}
              </div>
              {mode === 'create' && <div className="hint">Сначала сохрани промо, потом добавляй в очереди.</div>}
            </section>
          )}

          {/* Chain — «показывать только после другого промо» (все форматы).
              Чекбокс выключен → afterPromoId убирается из объекта. BFF
              (ChainChecker) отдаст это промо только после зафиксированного
              показа предшественника. */}
          <section className="ef-block">
            <div className="ef-label">ЦЕПОЧКА ПОКАЗОВ</div>
            <label className="ef-checkbox">
              <input
                type="checkbox"
                checked={chainOn}
                onChange={(e) => {
                  setChainOn(e.target.checked);
                  if (!e.target.checked) set({ afterPromoId: undefined });
                }}
              />
              Показывать только после другого промо
            </label>
            {chainOn && (
              <>
                <input
                  className="ef-input mono"
                  list="chain-promo-ids"
                  value={p.afterPromoId ?? ''}
                  onChange={(e) => set({ afterPromoId: e.target.value.trim() || undefined })}
                  placeholder="id промо-предшественника"
                  maxLength={64}
                />
                <datalist id="chain-promo-ids">
                  {poolPromos
                    .filter((pp) => pp.id !== p.id)
                    .map((pp) => (
                      <option key={pp.id} value={pp.id}>{`${pp.id} — ${pp.title}`}</option>
                    ))}
                </datalist>
                {p.afterPromoId && p.afterPromoId !== p.id &&
                  !poolPromos.some((pp) => pp.id === p.afterPromoId) && (
                  <div className="hint hint-warn">
                    Промо с таким id нет в пуле — это промо не будет показываться.
                  </div>
                )}
              </>
            )}
          </section>

          {/* Advanced disclosure */}
          <section className="ef-advanced">
            <button
              type="button"
              className="ef-advanced-toggle"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
            >
              <span>Расширенные настройки</span>
              <span className="ef-advanced-chev" aria-hidden>{advancedOpen ? '▴' : '▾'}</span>
            </button>

            {advancedOpen && (
              <div className="ef-advanced-body">
                {/* Identification */}
                <div className="ef-row">
                  <div className="ef-field">
                    <label>ID (slug)</label>
                    <input
                      className="ef-input mono"
                      value={p.id}
                      disabled={mode === 'edit'}
                      onChange={(e) => set({ id: e.target.value })}
                      placeholder="summer-sale"
                    />
                  </div>
                  <div className="ef-field">
                    <label>Внутреннее название</label>
                    <input
                      className="ef-input"
                      value={p.name}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder="Летняя акция 2025"
                    />
                  </div>
                </div>

                {/* Schedule */}
                <div className="ef-row">
                  <div className="ef-field">
                    <label>Начало показа</label>
                    <input
                      type="datetime-local"
                      className="ef-input"
                      value={isoToLocalInput(p.startsAt)}
                      onChange={(e) => set({ startsAt: localInputToIso(e.target.value) })}
                    />
                  </div>
                  <div className="ef-field">
                    <label>Окончание показа</label>
                    <input
                      type="datetime-local"
                      className="ef-input"
                      value={isoToLocalInput(p.endsAt)}
                      onChange={(e) => set({ endsAt: localInputToIso(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="ef-row">
                  <div className="ef-field">
                    <label>Лимит показов на пользователя</label>
                    <input
                      type="number"
                      className="ef-input mono"
                      min={1}
                      value={p.maxImpressionsPerUser ?? ''}
                      onChange={(e) =>
                        set({ maxImpressionsPerUser: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                      placeholder="∞"
                    />
                  </div>
                  <div className="ef-field">
                    <label>Кулдаун (часов)</label>
                    <input
                      type="number"
                      className="ef-input mono"
                      min={0}
                      value={p.cooldownHours}
                      onChange={(e) => set({ cooldownHours: Number(e.target.value) })}
                    />
                  </div>
                  <div className="ef-field">
                    <label>Аудитория</label>
                    <select
                      className="ef-input"
                      value={p.audience ?? 'all'}
                      onChange={(e) => set({ audience: e.target.value as Promo['audience'] })}
                    >
                      <option value="all">Все</option>
                      <option value="authenticated">Только залогиненные</option>
                      <option value="anonymous">Только гости</option>
                    </select>
                  </div>
                </div>

                {/* Targeting */}
                <div className="ef-row">
                  <div className="ef-field">
                    <label>Возраст от</label>
                    <input
                      type="number"
                      className="ef-input mono"
                      min={0}
                      value={p.targeting.minAge ?? ''}
                      onChange={(e) => setTargeting({ minAge: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—"
                    />
                  </div>
                  <div className="ef-field">
                    <label>Возраст до</label>
                    <input
                      type="number"
                      className="ef-input mono"
                      min={0}
                      value={p.targeting.maxAge ?? ''}
                      onChange={(e) => setTargeting({ maxAge: e.target.value === '' ? undefined : Number(e.target.value) })}
                      placeholder="—"
                    />
                  </div>
                  <div className="ef-field">
                    <label>Регионы</label>
                    <input
                      className="ef-input mono"
                      value={slugListToText(p.targeting.regions)}
                      onChange={(e) => setTargeting({ regions: parseSlugList(e.target.value) })}
                      placeholder="sukhum, gagra"
                    />
                  </div>
                </div>

                <div className="ef-field">
                  <label>Уровни подписки</label>
                  <div className="ef-checkbox-row">
                    {(['none', 'plus', 'premium'] as const).map((lvl) => {
                      const disabled = lvl === 'premium';
                      const title =
                        lvl === 'premium'
                          ? 'Не поддерживается биллингом (billing-service отдаёт только plus/none)'
                          : lvl === 'none'
                            ? 'none = не-PRO, ВКЛЮЧАЯ гостей; для отсечения гостей добавьте аудиторию «Только залогиненные»'
                            : undefined;
                      return (
                        <label key={lvl} className={`ef-checkbox${disabled ? ' is-disabled' : ''}`} title={title}>
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={p.targeting.subscriptionLevels?.includes(lvl) ?? false}
                            onChange={(e) => {
                              const cur  = p.targeting.subscriptionLevels ?? [];
                              const next = e.target.checked ? [...cur, lvl] : cur.filter((x) => x !== lvl);
                              setTargeting({ subscriptionLevels: next.length ? next : undefined });
                            }}
                          />
                          {lvl}
                        </label>
                      );
                    })}
                  </div>
                  {p.targeting.subscriptionLevels?.includes('none') && (
                    <span className="ef-hint">
                      none = не-PRO, включая гостей. Чтобы отсечь гостей, поставьте аудиторию «Только залогиненные».
                    </span>
                  )}
                </div>

                <div className="ef-row">
                  <div className="ef-field">
                    <label>Разделы</label>
                    <input
                      className="ef-input mono"
                      value={slugListToText(p.sections)}
                      onChange={(e) => set({ sections: parseSlugList(e.target.value) })}
                      placeholder="avto, realty"
                    />
                    <span className="ef-hint">
                      Работает только на overlay-поверхности; на topline/tooltip промо с разделами не показывается.
                    </span>
                  </div>
                  <div className="ef-field">
                    <label>Категории</label>
                    <input
                      className="ef-input mono"
                      value={slugListToText(p.categories)}
                      onChange={(e) => set({ categories: parseSlugList(e.target.value) })}
                      placeholder="kvartiry"
                    />
                  </div>
                  <div className="ef-field">
                    <label>По объявлениям</label>
                    <select
                      className="ef-input"
                      value={p.sellerStatus ?? ''}
                      onChange={(e) =>
                        set({ sellerStatus: e.target.value === '' ? undefined : (e.target.value as 'seller' | 'buyer') })
                      }
                    >
                      <option value="">Всем</option>
                      <option value="seller">Продавцам</option>
                      <option value="buyer">Покупателям</option>
                    </select>
                  </div>
                </div>

                {/* DivKit JSON paste — отдельный блок только для format=divkit */}
                {p.format === 'divkit' && (
                  <>
                    <div className="ef-divider" />
                    <div className="ef-field" style={{ gridColumn: '1 / -1' }}>
                      <label>
                        DivKit JSON
                        <span className="ef-hint">
                          {p.divkitUrl
                            ? ' (загружено в S3, можно отредактировать и пересохранить)'
                            : ' (улетит в S3 при «Сохранить промо»)'}
                        </span>
                      </label>
                      <textarea
                        className="ef-input"
                        rows={12}
                        placeholder={'{\n  "card": {\n    "log_id": "promo_001",\n    "states": [\n      {\n        "state_id": 0,\n        "div": {\n          "type": "container",\n          "items": [\n            { "type": "text", "text": "Заголовок", "font_size": 24 }\n          ]\n        }\n      }\n    ]\n  }\n}'}
                        value={p.divkitJson
                          ? JSON.stringify(p.divkitJson, null, 2)
                          : ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (!raw.trim()) {
                            set({ divkitJson: undefined });
                            return;
                          }
                          try {
                            const parsed = JSON.parse(raw);
                            set({ divkitJson: parsed, divkitUrl: undefined });
                          } catch {
                            // Невалидный JSON — игнорируем save в state,
                            // юзер увидит подсказку ниже и поправит.
                          }
                        }}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}
                      />
                      {!p.divkitJson && !p.divkitUrl && (
                        <span className="ef-hint" style={{ color: 'var(--app-fg2)' }}>
                          Вставьте корректный DivKit JSON-tree. После сохранения промо файл уедет в S3.
                        </span>
                      )}
                      {p.divkitUrl && (
                        <span className="ef-hint">
                          URL: <a href={p.divkitUrl} target="_blank" rel="noreferrer">{p.divkitUrl}</a>
                        </span>
                      )}
                    </div>
                  </>
                )}

                {/* Visual */}
                {(caps.colors || caps.bgImage || caps.dismissible || caps.gradient ||
                  caps.textAlign || caps.variants || caps.bullets) && (
                  <>
                    <div className="ef-divider" />

                    {/* Popup variant — только для popup */}
                    {caps.variants && (
                      <div className="ef-field">
                        <label>Шаблон попапа</label>
                        <div className="ef-segment">
                          {([
                            { v: 'classic', name: 'Classic', sub: 'image сверху → текст → CTA внизу' },
                            { v: 'split',   name: 'Split',   sub: 'image hero + content + bullets + CTA' },
                          ] as const).map(({ v, name, sub }) => {
                            const active = (p.popupVariant ?? 'classic') === v;
                            return (
                              <button
                                type="button"
                                key={v}
                                className={`ef-segment-btn${active ? ' is-active' : ''}`}
                                onClick={() => set({ popupVariant: v })}
                              >
                                <span className="ef-segment-name">{name}</span>
                                <span className="ef-segment-sub">{sub}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {caps.colors && (
                      <div className="ef-row">
                        <div className="ef-field">
                          <label>Цвет фона</label>
                          <input
                            type="color"
                            className="ef-input ef-color"
                            value={p.backgroundColor ?? '#E11D2A'}
                            onChange={(e) => set({ backgroundColor: e.target.value })}
                          />
                        </div>
                        <div className="ef-field">
                          <label>Цвет текста</label>
                          <input
                            type="color"
                            className="ef-input ef-color"
                            value={p.textColor ?? '#ffffff'}
                            onChange={(e) => set({ textColor: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {/* Gradient — для всех форматов по просьбе. Если from
                        пустой — gradient считается выключенным; и backgroundImage,
                        и backgroundColor работают как обычно. */}
                    {caps.gradient && (
                      <div className="ef-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Градиент фона <span className="ef-hint">(перекрывает «цвет фона», если задан)</span></label>
                        <div className="ef-gradient-row">
                          <input
                            type="color"
                            className="ef-input ef-color"
                            value={p.backgroundGradient?.from ?? '#E11D2A'}
                            onChange={(e) => set({
                              backgroundGradient: {
                                ...(p.backgroundGradient ?? {}),
                                from: e.target.value,
                              },
                            })}
                            title="Начало градиента"
                          />
                          <input
                            type="color"
                            className="ef-input ef-color"
                            value={p.backgroundGradient?.to ?? '#9B1B1B'}
                            onChange={(e) => set({
                              backgroundGradient: {
                                ...(p.backgroundGradient ?? { from: '#E11D2A' }),
                                to: e.target.value,
                              },
                            })}
                            title="Конец градиента"
                          />
                          <input
                            type="number"
                            className="ef-input"
                            min={0} max={360} step={5}
                            placeholder="135°"
                            value={p.backgroundGradient?.angle ?? ''}
                            onChange={(e) => {
                              const angle = e.target.value === '' ? undefined : Number(e.target.value);
                              set({
                                backgroundGradient: {
                                  ...(p.backgroundGradient ?? { from: '#E11D2A' }),
                                  angle,
                                },
                              });
                            }}
                            style={{ maxWidth: 100 }}
                          />
                          <button
                            type="button"
                            className="ef-link-btn"
                            onClick={() => set({ backgroundGradient: undefined })}
                          >Убрать градиент</button>
                        </div>
                      </div>
                    )}

                    {caps.bgImage && (
                      <div className="ef-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Фон-картинка попапа</label>
                        <PromoImageUpload
                          value={p.backgroundImage ?? ''}
                          onChange={(url) => set({ backgroundImage: url || undefined })}
                          label="Фон попапа"
                          recommend="1200×1600"
                          format={p.format}
                        />
                      </div>
                    )}

                    {/* Text alignment — все форматы с контентом */}
                    {caps.textAlign && (
                      <div className="ef-field">
                        <label>Выравнивание текста</label>
                        <div className="ef-segment">
                          {(['left', 'center', 'right'] as const).map((a) => {
                            const active = (p.textAlign ?? 'left') === a;
                            return (
                              <button
                                type="button"
                                key={a}
                                className={`ef-segment-btn${active ? ' is-active' : ''}`}
                                onClick={() => set({ textAlign: a })}
                                style={{ flex: 1 }}
                              >
                                <span className="ef-segment-name">
                                  {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
                                </span>
                                <span className="ef-segment-sub">
                                  {a === 'left' ? 'Слева' : a === 'center' ? 'По центру' : 'Справа'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* CTA colors — когда есть action */}
                    {p.action && (
                      <div className="ef-row">
                        <div className="ef-field">
                          <label>Цвет кнопки</label>
                          <input
                            type="color"
                            className="ef-input ef-color"
                            value={p.ctaColor ?? '#E11D2A'}
                            onChange={(e) => set({ ctaColor: e.target.value })}
                          />
                        </div>
                        <div className="ef-field">
                          <label>Цвет текста на кнопке</label>
                          <input
                            type="color"
                            className="ef-input ef-color"
                            value={p.ctaTextColor ?? '#ffffff'}
                            onChange={(e) => set({ ctaTextColor: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {/* Bullets — split popup и fullscreen */}
                    {caps.bullets && (p.popupVariant === 'split' || p.format === 'fullscreen') && (
                      <div className="ef-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Список преимуществ <span className="ef-hint">(каждая строка — отдельный пункт, до 6)</span></label>
                        <textarea
                          className="ef-input"
                          rows={4}
                          placeholder={"3 варианта под бюджет\nПроверка юридической чистоты\nПомощь со страховкой"}
                          value={(p.bullets ?? []).join('\n')}
                          onChange={(e) => {
                            const arr = e.target.value
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .slice(0, 6);
                            set({ bullets: arr.length ? arr : undefined });
                          }}
                        />
                      </div>
                    )}

                    {caps.dismissible && (
                      <label className="ef-checkbox">
                        <input
                          type="checkbox"
                          checked={p.dismissible ?? true}
                          onChange={(e) => set({ dismissible: e.target.checked })}
                        />
                        Можно закрыть кнопкой «×»
                      </label>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {error && <div className="ef-error">{error}</div>}
        </div>

        {/* ── Preview rail ─────────────────────────────────────── */}
        <aside className="editor-rail">
          <div className="prev-panel">
            <div className="prev-overline">ЖИВОЙ ПРЕВЬЮ</div>
            <div className="prev-devices" role="tablist" aria-label="Устройство">
              {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={device === d}
                  className={`prev-device${device === d ? ' on' : ''}`}
                  onClick={() => setDevice(d)}
                >
                  {d === 'desktop' ? 'Desktop' : d === 'tablet' ? 'Tablet' : 'Mobile'}
                </button>
              ))}
            </div>
            <div className={`prev-frame device-${device}`}>
              <PromoPreview promo={sanitize(p)} />
            </div>
            <div className="prev-foot">
              <div className="prev-overline">СЛОТ</div>
              <div className="mono prev-slot">{p.format} · feed-top</div>
              <div className="prev-overline" style={{ marginTop: 14 }}>ОЦЕНКА ОХВАТА</div>
              <div className="prev-reach">~ {estimateReach(p.format).toLocaleString('ru-RU')} / день</div>
              <div className="prev-reach-sub">на основе 30-дневного трафика</div>
            </div>
          </div>
        </aside>
      </div>

      <style>{EDITOR_CSS}</style>
    </form>
  );
}

// Quick reach guess so the preview rail has a number to show. Replace with
// real per-format CTRs once promo_analytics_funnel_by_format has enough data.
function estimateReach(fmt: Promo['format']): number {
  switch (fmt) {
    case 'topline':    return 4200;
    case 'inline':     return 2800;
    case 'popup':      return 1600;
    case 'fullscreen': return 900;
    case 'divkit':     return 1600;  // примерно как popup — JSON может рендериться где угодно
    case 'tooltip':    return 1200;  // anchored bubble, desktop-only
  }
}

function recommendForFormat(f: Promo['format']): string {
  if (f === 'topline')    return '1200×120';
  if (f === 'inline')     return '600×400';
  if (f === 'popup')      return '600×400';
  if (f === 'fullscreen') return '1200×1600';
  return '';
}

const EDITOR_CSS = `
.editor { display: flex; flex-direction: column; gap: 24px; padding: 0 0 80px; font-family: var(--font-sans); }
.editor .mono { font-family: var(--font-mono); }
.editor .hint { font-size: 12px; color: var(--app-fg4); margin-top: 6px; }
.editor .hint-warn { color: var(--brand-coral-700); font-weight: 600; }

.editor-bar {
  position: sticky; top: 0; z-index: 9;
  background: var(--app-bg);
  margin: -24px -32px 0;
  padding: 16px 32px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border-bottom: 1px solid var(--app-border);
}
.editor-back {
  font-size: 13px; font-weight: 600; color: var(--app-fg3);
  text-decoration: none;
}
.editor-back:hover { color: var(--app-fg1); text-decoration: none; }
.editor-actions { display: flex; align-items: center; gap: 10px; }

.ebtn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 36px; padding: 0 18px; border-radius: 10px;
  font-family: inherit; font-size: 13px; font-weight: 600;
  border: 1px solid transparent; cursor: pointer;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.ebtn:disabled { opacity: .55; cursor: wait; }
.ebtn-ghost   { background: #fff; border-color: var(--app-border); color: var(--app-fg2); }
.ebtn-ghost:hover:not(:disabled) { border-color: var(--app-border2); }
.ebtn-primary { background: var(--brand-coral-600); color: #fff; }
.ebtn-primary:hover:not(:disabled) { background: var(--brand-coral-700); }
.ebtn-danger  { background: #fff; border-color: var(--brand-coral-600); color: var(--brand-coral-700); }
.ebtn-danger:hover:not(:disabled) { background: var(--brand-coral-600); color: #fff; }

/* ── AI accent button ──────────────────────────────────────── */
/* Distinct from save/publish so the action's intent is obvious. */
.ebtn-ai {
  background: linear-gradient(180deg, #16181D 0%, #3A3F48 100%);
  color: #fff;
  padding: 0 18px 0 14px;
  gap: 8px;
  box-shadow: 0 0 0 1px rgba(225,29,42,0.2), 0 1px 2px rgba(0,0,0,0.04);
}
.ebtn-ai:hover:not(:disabled) {
  background: linear-gradient(180deg, #1f2329 0%, #45495520 100%);
  box-shadow: 0 4px 12px rgba(225,29,42,0.20);
}
.ebtn-ai-spark { font-size: 14px; line-height: 1; filter: drop-shadow(0 0 4px rgba(225,29,42,0.6)); }
.ebtn-ai-error {
  background: var(--status-danger-bg); color: var(--status-danger);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px; font-weight: 600;
  max-width: 260px; line-height: 1.3;
}

/* ── AI diff panel ─────────────────────────────────────────── */
.ai-diff {
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 0 rgba(16,18,22,0.04), 0 4px 16px rgba(16,18,22,0.06);
}
.ai-diff-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--app-border);
  background: linear-gradient(180deg, #FBF2EF 0%, #FFFFFF 100%);
}
.ai-diff-title {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--app-fg1);
}
.ai-diff-meta {
  display: flex; gap: 10px; align-items: center;
  margin-top: 4px;
  font-size: 11px; color: var(--app-fg4);
}
.ai-diff-cache {
  background: var(--app-surface2);
  border-radius: 999px; padding: 2px 8px;
  font-size: 10px; font-weight: 600;
}
.ai-diff-body {
  padding: 18px 20px 20px;
  display: flex; flex-direction: column; gap: 18px;
}
.ai-diff-empty {
  font-size: 13px; color: var(--app-fg3); margin: 0;
}
.ai-diff-row { display: flex; flex-direction: column; gap: 10px; }
.ai-diff-fieldname {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg3);
}
.ai-diff-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.ai-diff-cell {
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px; line-height: 1.45;
  color: var(--app-fg1);
}
.ai-diff-cur { background: var(--app-bg);   border: 1px solid var(--app-border);  }
.ai-diff-new { background: var(--status-success-bg); border: 1px solid #BFE0CC; }
.ai-diff-celllabel {
  font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg4);
  margin-bottom: 4px;
}
.ai-diff-new .ai-diff-celllabel { color: var(--status-success); }
.ai-diff-celltext { white-space: pre-wrap; word-break: break-word; }
.ai-diff-empty-inline { color: var(--app-fg4); font-style: italic; }
.ai-diff-actions { display: flex; gap: 10px; }

@media (max-width: 720px) {
  .ai-diff-grid { grid-template-columns: 1fr; }
}

.editor-head h1 {
  font-size: 36px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--app-fg1); margin: 0 0 6px;
}
.editor-meta { font-size: 13px; color: var(--app-fg4); }

.editor-ai { background: #fff; border: 1px solid var(--app-border); border-radius: 14px; padding: 16px; }

.editor-grid {
  display: grid; grid-template-columns: minmax(0, 720px) 416px;
  gap: 40px;
  align-items: start;
}
.editor-main { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.editor-rail { position: sticky; top: 96px; }

/* Block primitives */
.ef-block { display: flex; flex-direction: column; gap: 10px; }
.ef-label, .ef-label-row .ef-label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg3);
}
.ef-label-row { display: flex; align-items: baseline; justify-content: space-between; }
.ef-counter { font-size: 11px; color: var(--app-fg4); }
.ef-counter.over { color: var(--status-danger); font-weight: 700; }

.ef-input {
  width: 100%; background: #fff;
  border: 1px solid var(--app-border); border-radius: 12px;
  height: 52px; padding: 0 16px;
  font-family: var(--font-sans); font-size: 15px; font-weight: 500;
  color: var(--app-fg1);
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.ef-input.mono { font-family: var(--font-mono); font-size: 13px; }
.ef-input.title { font-weight: 700; font-size: 18px; }
.ef-input:focus { outline: 0; border-color: var(--brand-sea-600); box-shadow: 0 0 0 3px var(--input-focus-ring); }
.ef-input:disabled { background: var(--app-bg); color: var(--app-fg3); cursor: not-allowed; }
.ef-textarea { height: auto; min-height: 92px; padding: 14px 16px; line-height: 1.45; resize: vertical; }
.ef-color { height: 44px; padding: 4px 6px; cursor: pointer; }

/* Device target — segmented pill row, выбирается первым */
.device-target {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
}
.dt-pill {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 4px;
  text-align: left; cursor: pointer;
  font-family: inherit;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.dt-pill:hover:not(:disabled) { border-color: var(--app-border2); }
.dt-pill:disabled { opacity: 1; cursor: not-allowed; }
.dt-pill-name { font-size: 14px; font-weight: 700; color: var(--app-fg2); }
.dt-pill-sub  { font-size: 12px; font-weight: 500; color: var(--app-fg4); }
.dt-pill.active {
  background: #FDEFF0;
  border: 2px solid var(--brand-sea-700);
  padding: 13px 15px;
}
.dt-pill.active .dt-pill-name { color: var(--app-fg1); }
.dt-pill.active .dt-pill-sub  { color: var(--brand-sea-700); font-weight: 600; }

/* Format tiles — теперь auto-fit потому что количество переменное (3 или 4) */
.format-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
.fmt-tile {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 96px;
  cursor: pointer; text-align: left;
  font-family: inherit;
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.fmt-tile:hover:not(:disabled) { border-color: var(--app-border2); }
.fmt-tile:disabled { opacity: 1; cursor: not-allowed; }
.fmt-tile-glyph { width: 28px; height: 18px; border-radius: 4px; background: var(--app-border2); transition: background var(--dur-fast); }
.fmt-tile-name { font-size: 15px; font-weight: 700; color: var(--app-fg2); }
.fmt-tile-sub  { font-size: 12px; font-weight: 500; color: var(--app-fg4); }
.fmt-tile.active {
  background: #FDEFF0;
  border: 2px solid var(--brand-sea-700);
  padding: 13px;  /* compensate for the extra 1px border */
}
.fmt-tile.active .fmt-tile-glyph { background: var(--brand-sea-700); }
.fmt-tile.active .fmt-tile-name  { color: var(--app-fg1); }
.fmt-tile.active .fmt-tile-sub   { color: var(--brand-sea-700); font-weight: 600; }

/* CTA row */
.ef-cta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

/* Image preview */
.ef-image-preview {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: var(--app-surface2);
  border: 1px solid var(--app-border); border-radius: 12px;
}
.ef-image-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; background: var(--app-border); }
.ef-image-meta { font-size: 12px; color: var(--app-fg3); word-break: break-all; }

/* Queue chips */
.ef-queues { display: flex; flex-wrap: wrap; gap: 8px; }
.qchip {
  display: inline-flex; align-items: center;
  height: 32px; padding: 0 16px; border-radius: 999px;
  background: #fff; border: 1px solid var(--app-border);
  color: var(--app-fg2);
  font-family: inherit; font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.qchip:hover:not(:disabled) { border-color: var(--app-border2); }
.qchip:disabled { opacity: .6; cursor: not-allowed; }
.qchip.on {
  background: var(--brand-sea-700); border-color: var(--brand-sea-700);
  color: #fff;
}

/* Advanced disclosure */
.ef-advanced {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 14px; overflow: hidden;
}
.ef-advanced-toggle {
  width: 100%; background: none; border: 0;
  padding: 16px 20px;
  display: flex; align-items: center; justify-content: space-between;
  font-family: inherit; font-size: 14px; font-weight: 600;
  color: var(--app-fg1);
  cursor: pointer;
}
.ef-advanced-toggle:hover { background: var(--app-surface2); }
.ef-advanced-chev { color: var(--app-fg4); font-size: 12px; }
.ef-advanced-body {
  padding: 18px 20px 22px;
  border-top: 1px solid var(--app-border);
  display: flex; flex-direction: column; gap: 14px;
}
.ef-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.ef-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ef-field label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--app-fg3);
}
.ef-field .ef-input { height: 40px; font-size: 13px; }
.ef-field .ef-input.mono { font-size: 12px; }
.ef-checkbox-row { display: flex; gap: 18px; flex-wrap: wrap; }
.ef-checkbox {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 500; color: var(--app-fg2);
  cursor: pointer;
}
.ef-checkbox.is-disabled { opacity: .45; cursor: not-allowed; }
.ef-divider { height: 1px; background: var(--app-border); margin: 4px 0; }

/* Segmented control — popup variant + textAlign */
.ef-segment {
  display: flex; gap: 8px;
  flex-wrap: wrap;
}
.ef-segment-btn {
  display: inline-flex; flex-direction: column; gap: 2px;
  padding: 10px 14px;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: border-color .12s, background .12s;
  min-width: 120px;
}
.ef-segment-btn:hover { background: var(--app-bg-elev); }
.ef-segment-btn.is-active {
  border-color: var(--app-accent);
  background: var(--app-accent-soft, rgba(225,29,42,0.06));
}
.ef-segment-name {
  font-size: 13px; font-weight: 700; color: var(--app-fg);
}
.ef-segment-sub {
  font-size: 11px; font-weight: 500; color: var(--app-fg2);
}

/* Gradient picker row */
.ef-gradient-row {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
}
.ef-gradient-row .ef-color { width: 60px; height: 44px; flex-shrink: 0; }
.ef-hint {
  font-weight: 500; color: var(--app-fg2); font-size: 11.5px;
}
.ef-link-btn {
  background: none; border: 0; padding: 4px 0;
  color: var(--app-fg2); font: 600 12px var(--font-sans);
  cursor: pointer; text-decoration: underline;
}
.ef-link-btn:hover { color: var(--app-accent); }

.ef-error {
  background: var(--status-danger-bg); color: var(--status-danger);
  border-radius: 10px; padding: 12px 16px;
  font-size: 13px; font-weight: 600;
}

/* Preview rail */
.prev-panel {
  background: #16181D; border-radius: 20px;
  padding: 20px;
  display: flex; flex-direction: column; gap: 16px;
  min-height: 740px;
}
.prev-overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  color: var(--app-fg4);
}
.prev-devices {
  display: inline-flex; background: var(--app-fg2);
  border-radius: 999px; padding: 4px; gap: 4px;
  align-self: flex-start;
}
.prev-device {
  height: 24px; padding: 0 12px; border-radius: 999px;
  background: transparent; border: 0;
  font-family: inherit; font-size: 11px; font-weight: 600;
  color: var(--app-fg4); cursor: pointer;
}
.prev-device.on { background: #fff; color: var(--app-fg1); }
.prev-frame {
  flex: 1; min-height: 480px;
  background: var(--app-bg); border: 4px solid var(--app-fg2);
  border-radius: 28px;
  overflow: auto;
  padding: 20px;
  display: flex; align-items: flex-start; justify-content: center;
}
.prev-frame.device-mobile  { max-width: 280px; align-self: center; }
.prev-frame.device-tablet  { max-width: 560px; align-self: center; }
.prev-frame.device-desktop { max-width: 100%;  align-self: stretch; }
.prev-foot { display: flex; flex-direction: column; gap: 4px; }
.prev-slot { font-size: 13px; color: #fff; }
.prev-reach { font-size: 18px; font-weight: 700; color: var(--brand-coral-300); margin-top: 4px; }
.prev-reach-sub { font-size: 11px; color: var(--app-fg4); margin-top: 4px; }

/* Responsive */
@media (max-width: 1080px) {
  .editor-grid { grid-template-columns: 1fr; }
  .editor-rail { position: static; }
}
@media (max-width: 720px) {
  .format-tiles { grid-template-columns: repeat(2, 1fr); }
  .device-target { grid-template-columns: 1fr; }
  .ef-cta-row { grid-template-columns: 1fr; }
  .editor-head h1 { font-size: 28px; }
}
`;
