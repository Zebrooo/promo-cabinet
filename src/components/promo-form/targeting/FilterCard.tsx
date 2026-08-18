'use client';
import { FILTER_EDITORS } from './editors';
import type { FilterDescriptor } from './registry';

/** Свёрнутая карточка — название + сводка значений; развёрнутая — редактор
 *  фильтра на месте, без модалок. */
export function FilterCard({
  filter, summary, expanded, onToggle, onRemove,
}: {
  filter: FilterDescriptor;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const Editor = FILTER_EDITORS[filter.id];
  return (
    <div className={`ef-flt-card${expanded ? ' is-open' : ''}`}>
      <div className="ef-flt-head">
        <button
          type="button"
          className="ef-flt-title"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="ef-flt-name">{filter.label}</span>
          {!expanded && summary && <span className="ef-flt-summary">{summary}</span>}
        </button>
        <button
          type="button"
          className="ef-flt-remove"
          onClick={onRemove}
          aria-label={`Убрать фильтр «${filter.label}»`}
          title="Убрать фильтр"
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="ef-flt-body">
          <Editor />
        </div>
      )}
    </div>
  );
}
