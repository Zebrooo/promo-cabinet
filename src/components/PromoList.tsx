'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Promo } from '@/lib/schema';

// ─── helpers ────────────────────────────────────────────────────────────────

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

/** Case-insensitive substring match over id, title, internal name and format. */
function matches(p: Promo, q: string): boolean {
  return [p.id, p.title, p.name, p.format].some((field) => field.toLowerCase().includes(q));
}

function targetingSummary(t: Promo['targeting']): string {
  const parts: string[] = [];
  if (t.minAge !== undefined || t.maxAge !== undefined)
    parts.push(`${t.minAge ?? 0}–${t.maxAge ?? '∞'}`);
  if (t.regions?.length) parts.push(t.regions.join(', '));
  if (t.subscriptionLevels?.length) parts.push(t.subscriptionLevels.join(', '));
  return parts.length ? parts.join(' · ') : 'все';
}

// ─── format helpers ─────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  topline: 'Topline',
  popup: 'Popup',
  fullscreen: 'Fullscreen',
  inline: 'Inline',
};

const FORMATS = ['topline', 'popup', 'fullscreen', 'inline'] as const;

// ─── inline SVG icons ────────────────────────────────────────────────────────

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <line x1="4" y1="3.5" x2="13" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="4" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="4" y1="10.5" x2="13" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="1.5" cy="3.5" r="1" fill="currentColor"/>
      <circle cx="1.5" cy="7" r="1" fill="currentColor"/>
      <circle cx="1.5" cy="10.5" r="1" fill="currentColor"/>
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2 3.5H11M5 3.5V2.5H8V3.5M4.5 3.5V10.5H8.5V3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── props / component ───────────────────────────────────────────────────────

interface PromoListProps {
  promos: Promo[];
  /** queue names each promo belongs to: Record<promoId, queueName[]> */
  membership: Record<string, string[]>;
  /** all available queue names for the enqueue picker */
  queueNames: string[];
}

export function PromoList({ promos, membership, queueNames }: PromoListProps) {
  const router = useRouter();
  const [list, setList] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [fmtFilter, setFmtFilter] = useState('все');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  /** per-promo selected queue for the enqueue picker */
  const [pickedQueue, setPickedQueue] = useState<Record<string, string>>({});

  const q = query.trim().toLowerCase();
  const visible = list.filter((p) => {
    const matchQ = q ? matches(p, q) : true;
    const matchFmt = fmtFilter === 'все' || p.format === fmtFilter;
    return matchQ && matchFmt;
  });

  async function enqueue(promoId: string) {
    const queueName = pickedQueue[promoId] ?? queueNames[0];
    if (!queueName) return;
    setBusy(true);
    try {
      await fetch(`/api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(promoId)}`, {
        method: 'POST',
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeForever(id: string) {
    if (
      !confirm(`Удалить промо "${id}" совсем? Это уберёт его из всех очередей и из хранилища.`)
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setList((cur) => cur.filter((p) => p.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">Каталог</div>
          <h1>
            Все промо <span className="count-chip">{list.length}</span>
          </h1>
        </div>
        <Link href="/cabinet/new" className="btn btn-primary">
          + Создать
        </Link>
      </div>

      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="toolbar">
        {/* Search */}
        <div className="search-box">
          <IconSearch />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по id, заголовку, названию, формату…"
            aria-label="Поиск по каталогу промо"
          />
        </div>

        {/* Format filter */}
        <select
          className="filter-select"
          value={fmtFilter}
          onChange={(e) => setFmtFilter(e.target.value)}
          aria-label="Фильтр по формату"
        >
          <option value="все">Все форматы</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>

        {/* View toggle */}
        <div className="view-toggle" role="group" aria-label="Вид отображения">
          <button
            className={`view-btn${view === 'grid' ? ' active' : ''}`}
            onClick={() => setView('grid')}
            aria-label="Сетка"
            title="Сетка"
          >
            <IconGrid />
          </button>
          <button
            className={`view-btn${view === 'list' ? ' active' : ''}`}
            onClick={() => setView('list')}
            aria-label="Список"
            title="Список"
          >
            <IconList />
          </button>
        </div>

        {/* Result count */}
        <div className="result-count">
          {visible.length} из {list.length}
        </div>
      </div>

      {/* ── EMPTY STATE ─────────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="empty">
          {q || fmtFilter !== 'все'
            ? `Ничего не найдено${q ? ` по запросу «${query}»` : ''}${fmtFilter !== 'все' ? ` (формат: ${fmtFilter})` : ''}.`
            : 'Промо пока нет. Создайте первое.'}
        </div>
      ) : view === 'grid' ? (
        /* ── GRID VIEW ──────────────────────────────────────────────────── */
        <div className="promo-grid">
          {visible.map((p) => {
            const queuesIn = membership[p.id] ?? [];
            const selectedQ = pickedQueue[p.id] ?? queueNames[0] ?? '';
            const active = isActive(p);

            return (
              <article className="promo-card" key={p.id}>
                {/* Format colour stripe */}
                <div className={`fmt-stripe ${p.format}`} />

                {/* Card head — badges */}
                <div className="card-head">
                  <div className="card-tags">
                    {/* Format badge */}
                    <span className={`badge badge-${p.format}`}>
                      {FORMAT_LABELS[p.format] ?? p.format}
                    </span>
                    {/* Active/inactive badge */}
                    <span className={`badge ${active ? 'badge-active' : 'badge-inactive'}`}>
                      <span className={`dot${active ? ' pulse' : ''}`} />
                      {active ? 'Активен' : 'Неактивен'}
                    </span>
                    {/* Queue membership tags */}
                    {queuesIn.length > 0
                      ? queuesIn.map((qn) => (
                          <span key={qn} className="badge badge-tag">
                            {qn}
                          </span>
                        ))
                      : null}
                  </div>
                </div>

                {/* Card body — title + slug */}
                <div className="card-body">
                  <div className="card-title">{p.title}</div>
                  <div className="card-slug">{p.id}</div>
                </div>

                {/* Card meta — 6 cells (multiple of 3) */}
                <div className="card-meta">
                  <div className="meta-cell">
                    <div className="meta-label">Активен</div>
                    <div className="meta-val">{active ? 'да' : 'нет'}</div>
                  </div>
                  <div className="meta-cell">
                    <div className="meta-label">Лимит</div>
                    <div className="meta-val">{p.maxImpressionsPerUser ?? '∞'}</div>
                  </div>
                  <div className="meta-cell">
                    <div className="meta-label">Кулдаун</div>
                    <div className="meta-val">{p.cooldownHours ? `${p.cooldownHours} ч` : 'нет'}</div>
                  </div>
                  <div className="meta-cell">
                    <div className="meta-label">Разделы</div>
                    <div className="meta-val">{(p.sections ?? []).join(', ') || 'все'}</div>
                  </div>
                  <div className="meta-cell">
                    <div className="meta-label">Категории</div>
                    <div className="meta-val">{(p.categories ?? []).join(', ') || 'все'}</div>
                  </div>
                  <div className="meta-cell">
                    <div className="meta-label">Продавец/покуп.</div>
                    <div className="meta-val">
                      {p.sellerStatus === 'seller'
                        ? 'продавцы'
                        : p.sellerStatus === 'buyer'
                          ? 'покупатели'
                          : 'все'}
                    </div>
                  </div>
                </div>

                {/* Card actions — enqueue + edit + delete */}
                <div className="card-actions">
                  {queueNames.length > 0 && (
                    <>
                      <select
                        className="queue-select"
                        value={selectedQ}
                        onChange={(e) =>
                          setPickedQueue((cur) => ({ ...cur, [p.id]: e.target.value }))
                        }
                      >
                        {queueNames.map((qn) => (
                          <option key={qn} value={qn}>
                            {qn}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={busy || queuesIn.includes(selectedQ)}
                        onClick={() => enqueue(p.id)}
                        title={queuesIn.includes(selectedQ) ? 'Уже в этой очереди' : 'Добавить в очередь'}
                      >
                        В очередь
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}
                    title="Изменить"
                  >
                    <IconPencil />
                  </button>
                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    disabled={busy}
                    onClick={() => removeForever(p.id)}
                    title="Удалить совсем"
                  >
                    <IconTrash />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* ── LIST VIEW ──────────────────────────────────────────────────── */
        <div className="promo-list">
          {/* Header row */}
          <div className="list-header">
            <div /> {/* fmt-bar column */}
            <div>Название</div>
            <div>Формат</div>
            <div>Статус</div>
            <div>Лимит</div>
            <div>Кулдаун</div>
            <div>Разделы</div>
            <div /> {/* actions */}
          </div>

          {/* Data rows */}
          {visible.map((p) => {
            const active = isActive(p);
            return (
              <div className="promo-row" key={p.id}>
                {/* Format colour bar */}
                <div
                  className="fmt-bar"
                  style={{
                    background: `var(--stripe-${p.format})`,
                  }}
                />

                {/* Title + slug */}
                <div className="row-main">
                  <div className="row-title">{p.title}</div>
                  <div className="row-slug">{p.id}</div>
                </div>

                {/* Format */}
                <div className="row-cell">
                  <span className={`badge badge-${p.format}`}>
                    {FORMAT_LABELS[p.format] ?? p.format}
                  </span>
                </div>

                {/* Status */}
                <div className="row-cell">
                  <span className={`badge ${active ? 'badge-active' : 'badge-inactive'}`}>
                    <span className={`dot${active ? ' pulse' : ''}`} />
                    {active ? 'Активен' : 'Неактивен'}
                  </span>
                </div>

                {/* Limit */}
                <div className="row-cell">
                  <div className="row-cell-label">Лимит</div>
                  <div className="row-cell-val">{p.maxImpressionsPerUser ?? '∞'}</div>
                </div>

                {/* Cooldown */}
                <div className="row-cell">
                  <div className="row-cell-label">Кулдаун</div>
                  <div className="row-cell-val">
                    {p.cooldownHours ? `${p.cooldownHours} ч` : 'нет'}
                  </div>
                </div>

                {/* Sections */}
                <div className="row-cell">
                  <div className="row-cell-label">Разделы</div>
                  <div className="row-cell-val">{(p.sections ?? []).join(', ') || 'все'}</div>
                </div>

                {/* Actions */}
                <div className="row-actions">
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}
                    title="Изменить"
                  >
                    <IconPencil />
                  </button>
                  <button
                    className="btn btn-danger btn-sm btn-icon"
                    disabled={busy}
                    onClick={() => removeForever(p.id)}
                    title="Удалить совсем"
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
