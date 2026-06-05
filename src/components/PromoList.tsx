'use client';
// Promo catalogue grid — Figma "02 · Promo list" port.
//
// Layout:
//   [H1 "Все промо"] [count]                              [+ Новое промо]
//   [overline ОБНОВЛЕНО HH:MM · ОЧЕРЕДЕЙ N]
//   [Все] [Inline N] [Topline N] [Popup N] [Fullscreen N] [Архив N]   [search]
//   [Cards grid, 4 per row at 1440, auto-fit at narrower]
//
// Card content (matches Figma):
//   ┌────────────────────────────────────┐
//   │  ░░░ image / format colour block ░░ │
//   │  ░░░                       [status] │
//   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
//   ├────────────────────────────────────┤
//   │  Title (bold 16)                    │
//   │  [topline] [inline]                 │
//   │  02 июн                Изменить →   │
//   └────────────────────────────────────┘
//
// Card is a Link → /cabinet/<id>. Enqueue/Delete primary actions moved
// to the edit page (Figma 03) to keep the catalogue card clean.

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Promo } from '@/lib/schema';

interface PromoListProps {
  promos: Promo[];
  membership: Record<string, string[]>;
  queueNames: string[];
}

type StatusKind = 'active' | 'scheduled' | 'paused' | 'draft';

const FORMAT_LABELS: Record<string, string> = {
  inline:     'Inline',
  topline:    'Topline',
  popup:      'Popup',
  fullscreen: 'Fullscreen',
};

const FORMAT_FILTERS = ['inline', 'topline', 'popup', 'fullscreen'] as const;

function classifyStatus(p: Promo): StatusKind {
  if (!p.startsAt || !p.endsAt) return 'draft';
  const now = Date.now();
  const start = new Date(p.startsAt).getTime();
  const end   = new Date(p.endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 'draft';
  if (now < start) return 'scheduled';
  if (start <= now && now <= end) return 'active';
  return 'paused'; // expired — show as paused so user notices
}

const STATUS_LABEL: Record<StatusKind, string> = {
  active:    'АКТИВНО',
  scheduled: 'ЗАПЛАН.',
  paused:    'ПАУЗА',
  draft:     'ЧЕРНОВИК',
};

// Stable per-promo cover tint — picks one of 5 warm hues from the id hash so
// promos without an image still look distinct on the grid.
function coverHue(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const palette = ['#E11D2A', '#B89673', '#B91220', '#F6AE93', '#DF5530'];
  return palette[h % palette.length];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function PromoList({ promos, membership, queueNames }: PromoListProps) {
  const [query, setQuery] = useState('');
  const [fmtFilter, setFmtFilter] = useState<'all' | 'archive' | (typeof FORMAT_FILTERS)[number]>('all');

  // Counts per filter chip. "Архив" = expired promos (end date in the past).
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: promos.length, archive: 0 };
    for (const f of FORMAT_FILTERS) c[f] = 0;
    const now = Date.now();
    for (const p of promos) {
      if (p.format && c[p.format] !== undefined) c[p.format]++;
      if (p.endsAt && new Date(p.endsAt).getTime() < now) c.archive++;
    }
    return c;
  }, [promos]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const now = Date.now();
    const isExpired = (p: Promo) =>
      !!p.endsAt && new Date(p.endsAt).getTime() < now;
    return promos.filter((p) => {
      if (fmtFilter === 'archive') return isExpired(p);
      if (isExpired(p)) return false;
      if (fmtFilter !== 'all' && p.format !== fmtFilter) return false;
      if (!q) return true;
      return [p.id, p.title, p.name, p.format].some((f) => (f ?? '').toLowerCase().includes(q));
    });
  }, [promos, q, fmtFilter]);

  const updatedAt = useMemo(
    () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    [],
  );

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
        ОБНОВЛЕНО {updatedAt} · ОЧЕРЕДЕЙ {queueNames.length}
      </div>

      <div className="cat-toolbar">
        <div className="cat-chips" role="tablist" aria-label="Фильтр по формату">
          <FilterChip
            label="Все"
            count={counts.all}
            active={fmtFilter === 'all'}
            onClick={() => setFmtFilter('all')}
          />
          {FORMAT_FILTERS.map((f) => (
            <FilterChip
              key={f}
              label={FORMAT_LABELS[f]}
              count={counts[f]}
              active={fmtFilter === f}
              onClick={() => setFmtFilter(f)}
            />
          ))}
          <FilterChip
            label="Архив"
            count={counts.archive}
            active={fmtFilter === 'archive'}
            onClick={() => setFmtFilter('archive')}
          />
        </div>
        <div className="cat-search">
          <span className="cat-search-icon" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по заголовку…"
            aria-label="Поиск"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="cat-empty">
          {q || fmtFilter !== 'all'
            ? 'Ничего не найдено — попробуй другой фильтр или запрос.'
            : 'Промо пока нет — создай первое.'}
        </div>
      ) : (
        <div className="cat-grid">
          {visible.map((p) => (
            <PromoCard
              key={p.id}
              promo={p}
              queues={membership[p.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label, count, active, onClick,
}: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`chip${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="chip-label">{label}</span>
      <span className="chip-count">{count}</span>
    </button>
  );
}

function PromoCard({ promo, queues }: { promo: Promo; queues: string[] }) {
  const status = classifyStatus(promo);
  const cover = coverHue(promo.id);

  return (
    <Link href={`/cabinet/${encodeURIComponent(promo.id)}`} className="pcard" aria-label={`Открыть «${promo.title}»`}>
      <div className="pcard-cover" style={{ background: cover }}>
        <span className={`pcard-status status-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="pcard-body">
        <div className="pcard-title">{promo.title}</div>
        {queues.length > 0 && (
          <div className="pcard-queues">
            {queues.slice(0, 3).map((q) => (
              <span key={q} className="pcard-qchip">{q}</span>
            ))}
            {queues.length > 3 && <span className="pcard-qchip muted">+{queues.length - 3}</span>}
          </div>
        )}
        <div className="pcard-foot">
          <span className="pcard-date">{formatDate(promo.startsAt)}</span>
          <span className="pcard-edit">Изменить →</span>
        </div>
      </div>
    </Link>
  );
}
