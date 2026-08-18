'use client';
import { useEffect, useMemo, useState } from 'react';
import { useFormikContext } from 'formik';
import type { EntrySource, Promo } from '@/lib/schema';
import { FilterCard } from '../targeting/FilterCard';
import { FilterCatalog } from '../targeting/FilterCatalog';
import { clearFilter, filterIdsWithErrors, findFilter, visibleFilterIds } from '../targeting/registry';

const ENTRY_SOURCE_LABELS: Record<EntrySource, string> = {
  direct: 'Прямой',
  search: 'Поиск',
  telegram: 'Telegram',
  other: 'Другое',
};

/** Таргетинг как набор подключаемых фильтров: видны только включённые,
 *  остальные добавляются из каталога. Пусто = промо показывается всем. */
export function TargetingSection() {
  const { values, errors, touched, setFieldValue } = useFormikContext<Promo>();

  // Фильтры, добавленные в этой сессии, но ещё пустые: по значениям их не
  // отличить от невыбранных, поэтому держим отдельным UI-состоянием.
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const visible = useMemo(() => visibleFilterIds(values, extraIds), [values, extraIds]);

  // Ошибка внутри свёрнутой карточки не видна — раскрываем её, как только она
  // становится показанной (сабмит с ошибкой помечает touched всё дерево
  // ошибок; submitCount тут не годится — форма сабмитится своим onSubmit в
  // обход Formik, и счётчик остаётся нулевым). Карточку при этом ещё и
  // показываем: ошибка может сидеть в поле, которое само по себе фильтр не
  // включает (окно движения кошелька, период покупок), и без этого её было бы
  // нечем починить.
  useEffect(() => {
    const broken = filterIdsWithErrors(errors, touched);
    if (broken.length === 0) return;
    const add = (cur: string[]) =>
      (broken.every((id) => cur.includes(id)) ? cur : [...new Set([...cur, ...broken])]);
    setExtraIds(add);
    setExpandedIds(add);
  }, [errors, touched]);

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

      {/* «Источник захода» (entrySources) из формы убран по фидбеку владельца:
          дублировал ось «Среда» (Telegram в обоих). Поле живёт в схеме и
          to-persisted ради обратной совместимости; у промо с уже сохранённым
          значением показываем компактную строку с возможностью очистить —
          значение не теряется молча. Фильтром в каталоге не заводим намеренно:
          добавить его заново нельзя, только убрать. */}
      {Boolean(values.entrySources?.length) && (
        <div className="ef-field">
          <span className="ef-sublabel">
            Источник захода: {(values.entrySources ?? []).map((src) => ENTRY_SOURCE_LABELS[src]).join(', ')}
            {' '}
            <button
              type="button"
              className="ef-link-btn"
              onClick={() => setFieldValue('entrySources', undefined)}
            >
              очистить
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
