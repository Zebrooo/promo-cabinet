'use client';
import { useEffect, useMemo, useState } from 'react';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { FilterCard } from '../targeting/FilterCard';
import { FilterCatalog } from '../targeting/FilterCatalog';
import { clearFilter, filterIdsWithErrors, findFilter, visibleFilterIds } from '../targeting/registry';

/** Таргетинг как набор подключаемых фильтров: видны только включённые,
 *  остальные добавляются из каталога. Пусто = промо показывается всем. */
export function TargetingSection() {
  const { values, errors, submitCount, setFieldValue } = useFormikContext<Promo>();

  // Фильтры, добавленные в этой сессии, но ещё пустые: по значениям их не
  // отличить от невыбранных, поэтому держим отдельным UI-состоянием.
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const visible = useMemo(() => visibleFilterIds(values, extraIds), [values, extraIds]);

  // Ошибка внутри свёрнутой карточки не видна — раскрываем её на сабмите.
  useEffect(() => {
    if (submitCount === 0) return;
    const broken = filterIdsWithErrors(errors);
    if (broken.length === 0) return;
    setExpandedIds((cur) => [...new Set([...cur, ...broken])]);
  }, [submitCount, errors]);

  function addFilter(id: string) {
    setExtraIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    setExpandedIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }

  function removeFilter(id: string) {
    const filter = findFilter(id);
    if (filter) clearFilter(filter, setFieldValue);
    setExtraIds((cur) => cur.filter((x) => x !== id));
    setExpandedIds((cur) => cur.filter((x) => x !== id));
  }

  return (
    <section className="ef-block">
      <div className="ef-label">ТАРГЕТИНГ</div>
      {visible.length > 0 && (
        <div className="ef-flt-list">
          {visible.map((id) => {
            const filter = findFilter(id);
            if (!filter) return null;
            return (
              <FilterCard
                key={id}
                filter={filter}
                summary={filter.isActive(values) ? filter.summary(values) : 'не заполнен'}
                expanded={expandedIds.includes(id)}
                onToggle={() =>
                  setExpandedIds((cur) =>
                    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
                }
                onRemove={() => removeFilter(id)}
              />
            );
          })}
        </div>
      )}
      <FilterCatalog addedIds={visible} onPick={addFilter} />
      {visible.length === 0 && (
        <div className="ef-flt-empty">Фильтров нет — промо показывается всем.</div>
      )}
    </section>
  );
}
