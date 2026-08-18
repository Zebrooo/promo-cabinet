'use client';
import { useState } from 'react';
import { FILTERS, GROUP_LABELS, GROUP_ORDER } from './registry';

/** Панель «+ Добавить фильтр»: поиск по названию + группы. Уже добавленные
 *  фильтры показываются задизейбленными, чтобы не плодить дубли карточек. */
export function FilterCatalog({
  addedIds, onPick,
}: {
  addedIds: readonly string[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const matched = FILTERS.filter((f) => !needle || f.label.toLowerCase().includes(needle));

  if (!open) {
    return (
      <button type="button" className="ef-flt-add" onClick={() => setOpen(true)}>
        + Добавить фильтр
      </button>
    );
  }

  return (
    <div className="ef-flt-catalog">
      <div className="ef-flt-catalog-head">
        <input
          className="ef-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти фильтр…"
        />
        <button
          type="button"
          className="ef-flt-remove"
          onClick={() => { setOpen(false); setQuery(''); }}
          aria-label="Закрыть каталог фильтров"
        >
          ✕
        </button>
      </div>
      {GROUP_ORDER.map((group) => {
        const items = matched.filter((f) => f.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="ef-flt-group">
            <div className="ef-label">{GROUP_LABELS[group]}</div>
            {items.map((f) => {
              const added = addedIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="ef-flt-option"
                  disabled={added}
                  onClick={() => { onPick(f.id); setOpen(false); setQuery(''); }}
                >
                  {f.label}
                  {added && <span className="ef-flt-added">уже добавлен</span>}
                </button>
              );
            })}
          </div>
        );
      })}
      {matched.length === 0 && <div className="ef-hint">Ничего не найдено</div>}
    </div>
  );
}
