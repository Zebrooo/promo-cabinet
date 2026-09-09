'use client';
// Каталог промо — страница «Все промо».
//
// Layout:
//   [H1 "Все промо"] [count]                              [+ Новое промо]
//   [overline: ПОКАЗАНО N ИЗ M · ОЧЕРЕДЕЙ K]
//   [Активные N] [Запланированные N] [Архив N]        [поиск …………]
//   [Inline N] [Promoline N] … [Custom N]   [сортировка] [вид] [Ещё фильтры]
//   ( панель «Ещё фильтры»: очередь, устройство, аудитория, роль, таргетинг,
//     признаки, ОС/среда/класс, гео, источник, разделы, категории, период )
//   [активные условия: Формат: Inline ×  Очередь: Главная ×  … Сбросить всё]
//   [карточки 4 в ряд | таблица]
//
// Вся логика отбора — в src/lib/promo-filters.ts; здесь только рендер и
// синхронизация состояния с URL (history.replaceState, без перезагрузки RSC).

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Promo } from '@/lib/schema';
import { FORMAT_LABEL } from '@/lib/format-labels';
import { KNOWN_CUSTOM_VARIANTS } from '@/lib/custom-variants';
import {
  EMPTY_FILTERS,
  FACETS,
  FLAG_LABEL,
  SORT_LABEL,
  SORT_ORDER,
  STATUS_BADGE,
  WARNING_FLAGS,
  WARNING_TEXT,
  activeFilterCount,
  activeTargetingIds,
  applyFilters,
  buildFacetContext,
  daysUntilEnd,
  facetCounts,
  facetOptions,
  isLegacyQueue,
  promoFlags,
  promoQueues,
  promoStatus,
  queueLabel,
  selected,
  serializeFilters,
  setFacet,
  targetingSummary,
  toggleFacetValue,
  type FacetContext,
  type FacetDef,
  type FacetOption,
  type PromoListFilters,
  type SortKey,
} from '@/lib/promo-filters';

interface PromoListProps {
  promos: Promo[];
  membership: Record<string, string[]>;
  queueNames: string[];
  /** Состояние фильтров, разобранное сервером из URL. */
  initial?: PromoListFilters;
  /** «Сейчас» с сервера — одно на сервер и клиент, чтобы гидрация совпала. */
  now?: number;
}

const DEVICE_SHORT: Record<string, string> = { both: 'Все устройства', desktop: 'Десктоп', touch: 'Тач' };

// Стабильный тёплый оттенок обложки по id — промо без картинки всё равно
// различимы на сетке.
function coverHue(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const palette = ['#E11D2A', '#B89673', '#B91220', '#F6AE93', '#DF5530'];
  return palette[h % palette.length];
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDate(iso: string | undefined, now: number): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${sameYear ? '' : ` ${d.getUTCFullYear()}`}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «до 12 сен · 3 дн.» / «истекло 2 сен» / «с 15 окт» — одна строка про окно показа. */
function windowLine(p: Promo, now: number): { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  const status = promoStatus(p, now);
  if (status === 'scheduled') return { text: `с ${formatDate(p.startsAt, now)}`, tone: 'muted' };
  if (status === 'expired') return { text: `истекло ${formatDate(p.endsAt, now)}`, tone: 'muted' };
  const left = daysUntilEnd(p, now);
  if (left === null) return { text: 'бессрочно', tone: 'ok' };
  const days = Math.max(left, 0);
  const tail = days === 0 ? 'сегодня' : `${days} ${plural(days, 'день', 'дня', 'дней')}`;
  return {
    text: `до ${formatDate(p.endsAt, now)} · ${tail}`,
    tone: days <= 1 ? 'danger' : days <= 7 ? 'warn' : 'ok',
  };
}

export function PromoList({ promos, membership, queueNames, initial = EMPTY_FILTERS, now = Date.now() }: PromoListProps) {
  const [filters, setFilters] = useState<PromoListFilters>(initial);
  const [moreOpen, setMoreOpen] = useState(() =>
    FACETS.some((f) => f.placement === 'more' && selected(initial, f.id).length > 0) || Boolean(initial.from || initial.to),
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const ctx = useMemo(() => buildFacetContext(promos, membership, queueNames, now), [promos, membership, queueNames, now]);
  const visible = useMemo(() => applyFilters(promos, filters, ctx), [promos, filters, ctx]);
  const counts = useMemo(() => facetCounts(promos, filters, ctx), [promos, filters, ctx]);
  const optionsByFacet = useMemo(
    () => Object.fromEntries(FACETS.map((f) => [f.id, facetOptions(f, promos, ctx)])) as Record<string, FacetOption[]>,
    [promos, ctx],
  );
  const activeCount = activeFilterCount(filters);

  // URL ↔ состояние: replaceState не трогает RSC-кэш и не перечитывает S3.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const qs = serializeFilters(filters);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [filters]);

  // «/» — в поиск, Esc в поиске — очистить.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (facetId: string, value: string) => setFilters((f) => toggleFacetValue(f, facetId, value));
  const reset = () => setFilters((f) => ({ ...EMPTY_FILTERS, sort: f.sort, view: f.view }));

  const primary = FACETS.filter((f) => f.placement === 'primary');
  const more = FACETS.filter((f) => f.placement === 'more');
  const moreSelected = more.filter((f) => selected(filters, f.id).length > 0).length + (filters.from || filters.to ? 1 : 0);
  const archived = counts.status.expired ?? 0;

  return (
    <div className="promo-catalogue">
      <header className="cat-head">
        <div className="cat-title-row">
          <h1 className="cat-title">Все промо</h1>
          <span className="cat-count">{promos.length}</span>
        </div>
        <Link href="/cabinet/new" className="cat-cta">
          <span className="cat-cta-plus">+</span>
          <span>Новое промо</span>
        </Link>
      </header>

      <div className="cat-overline">
        ПОКАЗАНО {visible.length} ИЗ {promos.length} · ОЧЕРЕДЕЙ {queueNames.length}
        {archived > 0 && ` · В АРХИВЕ ${archived}`}
      </div>

      {primary.map((facet, i) => (
        <div className="cat-toolbar" key={facet.id}>
          <div className="cat-chips" role="group" aria-label={facet.label}>
            {optionsByFacet[facet.id].map((o) => (
              <FilterChip
                key={o.id}
                label={o.label}
                count={counts[facet.id][o.id] ?? 0}
                active={selected(filters, facet.id).includes(o.id)}
                onClick={() => toggle(facet.id, o.id)}
              />
            ))}
          </div>
          {i === 0 ? (
            <div className="cat-search">
              <span className="cat-search-icon" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Escape') setFilters((f) => ({ ...f, q: '' })); }}
                placeholder="Поиск: id, название, ссылка, текст…  ( / )"
                aria-label="Поиск"
              />
            </div>
          ) : (
            <div className="cat-tools">
              <label className="cat-sort">
                <span className="cat-sort-label">Сортировка</span>
                <select
                  className="filter-select"
                  value={filters.sort}
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
                >
                  {SORT_ORDER.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
                </select>
              </label>
              <div className="view-toggle" role="group" aria-label="Вид">
                <button
                  type="button"
                  className={`view-btn${filters.view === 'cards' ? ' active' : ''}`}
                  aria-pressed={filters.view === 'cards'}
                  onClick={() => setFilters((f) => ({ ...f, view: 'cards' }))}
                  title="Карточки"
                >▦</button>
                <button
                  type="button"
                  className={`view-btn${filters.view === 'table' ? ' active' : ''}`}
                  aria-pressed={filters.view === 'table'}
                  onClick={() => setFilters((f) => ({ ...f, view: 'table' }))}
                  title="Таблица"
                >☰</button>
              </div>
              <button
                type="button"
                className={`btn btn-secondary${moreOpen ? ' is-open' : ''}`}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
              >
                Ещё фильтры{moreSelected > 0 && <span className="btn-badge">{moreSelected}</span>}
              </button>
              {activeCount > 0 && (
                <button type="button" className="btn btn-ghost" onClick={reset}>Сбросить</button>
              )}
            </div>
          )}
        </div>
      ))}

      {moreOpen && (
        <div className="cat-more" role="region" aria-label="Дополнительные фильтры">
          {more.map((facet) => {
            const options = optionsByFacet[facet.id];
            const chosen = selected(filters, facet.id);
            // Data-driven фасет без единого значения в пуле — не показываем.
            if (options.length === 0 && chosen.length === 0) return null;
            return (
              <div className="cat-more-group" key={facet.id}>
                <div className="cat-more-label">{facet.label}</div>
                {facet.control === 'chips' ? (
                  <div className="cat-chips cat-chips--sm" role="group" aria-label={facet.label}>
                    {options.map((o) => (
                      <FilterChip
                        key={o.id}
                        small
                        label={o.label}
                        count={counts[facet.id][o.id] ?? 0}
                        active={chosen.includes(o.id)}
                        onClick={() => toggle(facet.id, o.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <FacetSelect
                    facet={facet}
                    options={options}
                    counts={counts[facet.id]}
                    chosen={chosen}
                    onToggle={(v) => toggle(facet.id, v)}
                    onClear={() => setFilters((f) => setFacet(f, facet.id, []))}
                  />
                )}
              </div>
            );
          })}
          <div className="cat-more-group">
            <div className="cat-more-label">Показ в период</div>
            <div className="cat-period">
              <input
                className="filter-select"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                aria-label="С даты"
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
              <span className="cat-period-sep">—</span>
              <input
                className="filter-select"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                aria-label="По дату"
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </div>
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <ActiveFilters
          filters={filters}
          optionsByFacet={optionsByFacet}
          onRemove={(facetId, value) => toggle(facetId, value)}
          onClearQuery={() => setFilters((f) => ({ ...f, q: '' }))}
          onClearPeriod={() => setFilters((f) => ({ ...f, from: '', to: '' }))}
          onReset={reset}
        />
      )}

      {visible.length === 0 ? (
        <div className="cat-empty">
          {activeCount > 0
            ? 'Ничего не найдено — ослабьте фильтры или измените запрос.'
            : archived === promos.length && promos.length > 0
              ? 'Все промо в архиве — включите статус «Архив», чтобы их увидеть.'
              : 'Промо пока нет — создайте первое.'}
        </div>
      ) : filters.view === 'table' ? (
        <PromoTable promos={visible} ctx={ctx} />
      ) : (
        <div className="cat-grid">
          {visible.map((p) => <PromoCard key={p.id} promo={p} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── контролы ───────────────────────── */

function FilterChip({
  label, count, active, onClick, small = false,
}: {
  label: string; count: number; active: boolean; onClick: () => void; small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`chip${active ? ' active' : ''}${small ? ' chip--sm' : ''}${count === 0 && !active ? ' chip--empty' : ''}`}
      onClick={onClick}
    >
      <span className="chip-label">{label}</span>
      <span className="chip-count">{count}</span>
    </button>
  );
}

/** Выпадающий мультиселект с поиском и группами — для фасетов с десятками опций (очереди). */
function FacetSelect({
  facet, options, counts, chosen, onToggle, onClear,
}: {
  facet: FacetDef;
  options: FacetOption[];
  counts: Record<string, number>;
  chosen: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const needle = q.trim().toLowerCase();
  // Пустые опции прячем, кроме выбранных — иначе список из 40 очередей нечитаем.
  const shown = options.filter((o) =>
    (chosen.includes(o.id) || (counts[o.id] ?? 0) > 0) &&
    (!needle || o.label.toLowerCase().includes(needle) || o.id.toLowerCase().includes(needle)),
  );
  const groups = new Map<string, FacetOption[]>();
  for (const o of shown) {
    const g = o.group ?? '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(o);
  }
  const summary = chosen.length === 0
    ? 'Любые'
    : chosen.length <= 2
      ? chosen.map((v) => options.find((o) => o.id === v)?.label ?? v).join(', ')
      : `Выбрано ${chosen.length}`;

  return (
    <div className={`fsel${open ? ' open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`fsel-btn${chosen.length ? ' has-value' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fsel-value">{summary}</span>
        <span className="fsel-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="fsel-pop">
          {options.length > 8 && (
            <input
              className="fsel-search"
              type="search"
              placeholder="Найти…"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
              aria-label={`Поиск: ${facet.label}`}
            />
          )}
          <div className="fsel-list" role="listbox" aria-multiselectable aria-label={facet.label}>
            {shown.length === 0 && <div className="fsel-empty">Нет вариантов</div>}
            {[...groups.entries()].map(([group, items]) => (
              <div key={group} className="fsel-group">
                {group && <div className="fsel-group-label">{group}</div>}
                {items.map((o) => {
                  const on = chosen.includes(o.id);
                  return (
                    <label key={o.id} className={`fsel-item${on ? ' on' : ''}`} title={o.id !== o.label ? o.id : undefined}>
                      <input type="checkbox" checked={on} onChange={() => onToggle(o.id)} />
                      <span className="fsel-item-label">{o.label}</span>
                      <span className="fsel-item-count">{counts[o.id] ?? 0}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {chosen.length > 0 && (
            <div className="fsel-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Очистить</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveFilters({
  filters, optionsByFacet, onRemove, onClearQuery, onClearPeriod, onReset,
}: {
  filters: PromoListFilters;
  optionsByFacet: Record<string, FacetOption[]>;
  onRemove: (facetId: string, value: string) => void;
  onClearQuery: () => void;
  onClearPeriod: () => void;
  onReset: () => void;
}) {
  const pills: { key: string; text: string; onRemove: () => void }[] = [];
  if (filters.q.trim()) pills.push({ key: 'q', text: `Поиск: «${filters.q.trim()}»`, onRemove: onClearQuery });
  if (filters.from || filters.to) {
    pills.push({ key: 'period', text: `Период: ${filters.from || '…'} — ${filters.to || '…'}`, onRemove: onClearPeriod });
  }
  for (const facet of FACETS) {
    for (const v of selected(filters, facet.id)) {
      const label = optionsByFacet[facet.id].find((o) => o.id === v)?.label ?? v;
      pills.push({ key: `${facet.id}:${v}`, text: `${facet.label}: ${label}`, onRemove: () => onRemove(facet.id, v) });
    }
  }
  return (
    <div className="cat-active" aria-label="Активные фильтры">
      {pills.map((p) => (
        <button key={p.key} type="button" className="apill" onClick={p.onRemove} title="Убрать условие">
          <span>{p.text}</span>
          <span className="apill-x" aria-hidden>×</span>
        </button>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>Сбросить всё</button>
    </div>
  );
}

/* ───────────────────────── карточка ───────────────────────── */

function customLabelFor(p: Promo): string | null {
  if (p.format !== 'custom') return null;
  return KNOWN_CUSTOM_VARIANTS.find((v) => v.id === p.variant)?.label ?? p.variant ?? '(без варианта)';
}

function Warnings({ promo, ctx, compact = false }: { promo: Promo; ctx: FacetContext; compact?: boolean }) {
  // Архивное промо уже не показывается — предупреждать про очередь/картинку нечего.
  if (promoStatus(promo, ctx.now) === 'expired') return null;
  const flags = promoFlags(promo, ctx);
  const warns = WARNING_FLAGS.filter((f) => flags.has(f));
  if (warns.length === 0) return null;
  const severe = (f: string) => f === 'noQueue' || f === 'chainBroken' || f === 'legacyOnly';
  return (
    <div className={`pwarn${compact ? ' pwarn--compact' : ''}`}>
      {warns.map((f) => (
        <span key={f} className={`pwarn-item${severe(f) ? ' severe' : ''}`} title={WARNING_TEXT[f]}>
          <span aria-hidden>⚠</span>{!compact && ` ${FLAG_LABEL[f]}`}
        </span>
      ))}
    </div>
  );
}

function PromoCard({ promo, ctx }: { promo: Promo; ctx: FacetContext }) {
  const status = promoStatus(promo, ctx.now);
  const href = `/cabinet/${encodeURIComponent(promo.id)}`;
  const queues = promoQueues(promo, ctx);
  const targeting = activeTargetingIds(promo).length;
  const win = windowLine(promo, ctx.now);
  const customLabel = customLabelFor(promo);
  const cover = promo.imageUrl ?? promo.backgroundImage ?? promo.steps?.find((s) => s.imageUrl)?.imageUrl;

  return (
    <article className="pcard">
      <Link
        href={href}
        className="pcard-cover"
        style={{
          backgroundColor: coverHue(promo.id),
          ...(cover ? { backgroundImage: `url("${cover}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
        }}
        aria-label={`Открыть «${promo.title}»`}
      >
        <span className={`pcard-status status-${status}`}>{STATUS_BADGE[status]}</span>
        <span className={`pcard-format badge badge-${promo.format}`}>{FORMAT_LABEL[promo.format].name}</span>
        {customLabel !== null && (
          <span className="pcard-badge pcard-badge--custom">
            {customLabel}
            <em> [custom]</em>
          </span>
        )}
      </Link>
      <div className="pcard-body">
        <Link href={href} className="pcard-title">{promo.title}</Link>
        <div className="pcard-meta">
          <span className={`pcard-window tone-${win.tone}`}>{win.text}</span>
          <span className="pcard-device" title="Устройства">{DEVICE_SHORT[promo.deviceTarget ?? 'both']}</span>
        </div>
        <div className="pcard-queues">
          {queues.length === 0 ? (
            <span className="pcard-qchip muted">не в очереди</span>
          ) : (
            <>
              {queues.slice(0, 3).map((q) => (
                <span key={q} className={`pcard-qchip${isLegacyQueue(q) ? ' legacy' : ''}`} title={q}>{queueLabel(q)}</span>
              ))}
              {queues.length > 3 && <span className="pcard-qchip muted" title={queues.slice(3).join(', ')}>+{queues.length - 3}</span>}
            </>
          )}
          {targeting > 0 && (
            <span className="pcard-qchip targeting" title={targetingSummary(promo).join('\n')}>
              {targeting} {plural(targeting, 'условие', 'условия', 'условий')}
            </span>
          )}
        </div>
        <Warnings promo={promo} ctx={ctx} />
        <div className="pcard-foot">
          <span className="pcard-date" title={promo.id}>{promo.id}</span>
          <span className="pcard-links">
            {promo.leadCapture && (
              <Link href={`/cabinet/leads?promoId=${encodeURIComponent(promo.id)}`} className="pcard-lead">Лиды</Link>
            )}
            <Link href={href} className="pcard-edit">Изменить →</Link>
          </span>
        </div>
      </div>
    </article>
  );
}

/* ───────────────────────── таблица ───────────────────────── */

function PromoTable({ promos, ctx }: { promos: Promo[]; ctx: FacetContext }) {
  return (
    <div className="leads-table-card">
      <div className="aa-table-wrap">
        <table className="aa-table promo-table">
          <thead>
            <tr>
              <th>Промо</th>
              <th>Формат</th>
              <th>Статус</th>
              <th>Окно показа</th>
              <th>Устройство</th>
              <th>Очереди</th>
              <th>Таргетинг</th>
              <th aria-label="Предупреждения" />
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => {
              const status = promoStatus(p, ctx.now);
              const queues = promoQueues(p, ctx);
              const targeting = activeTargetingIds(p).length;
              const win = windowLine(p, ctx.now);
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/cabinet/${encodeURIComponent(p.id)}`} className="ptable-title">{p.title}</Link>
                    <div className="aa-key">{p.id}</div>
                  </td>
                  <td><span className={`badge badge-${p.format}`}>{FORMAT_LABEL[p.format].name}</span></td>
                  <td><span className={`pcard-status status-${status} inline`}>{STATUS_BADGE[status]}</span></td>
                  <td>
                    <div className="ptable-dates">{formatDate(p.startsAt, ctx.now)} — {formatDate(p.endsAt, ctx.now)}</div>
                    <div className={`ptable-window tone-${win.tone}`}>{win.text}</div>
                  </td>
                  <td>{DEVICE_SHORT[p.deviceTarget ?? 'both']}</td>
                  <td>
                    {queues.length === 0
                      ? <span className="leads-muted">—</span>
                      : queues.map((q) => (
                        <span key={q} className={`badge badge-tag${isLegacyQueue(q) ? ' legacy' : ''}`} title={q}>{queueLabel(q)}</span>
                      ))}
                  </td>
                  <td title={targetingSummary(p).join('\n')}>{targeting > 0 ? targeting : <span className="leads-muted">—</span>}</td>
                  <td><Warnings promo={p} ctx={ctx} compact /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
