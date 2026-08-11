'use client';
import { useEffect, useRef, useState } from 'react';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { SlugListField, FieldError } from '../fields';

type SearchCriteriaKey = 'terms' | 'sections';

function parseCommaList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function SearchListInput({
  value,
  onChange,
  placeholder,
}: {
  value?: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(() => (value ?? []).join(', '));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft((value ?? []).join(', '));
  }, [value]);

  return (
    <input
      className="ef-input mono"
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        onChange(parseCommaList(next));
      }}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        // Formik may have reset the value while this input was focused. Use
        // the canonical prop on blur instead of reviving the stale local draft.
        setDraft((value ?? []).join(', '));
      }}
      placeholder={placeholder}
    />
  );
}

/** Возраст/регионы/подписки/поиск/sections/categories/sellerStatus/audience. */
export function TargetingSection() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;
  const search = targeting.search;
  const searchEnabled = Boolean(search?.terms?.length || search?.sections?.length);

  function setSearchCriteria(key: SearchCriteriaKey, items: string[]) {
    const terms = key === 'terms' ? items : search?.terms;
    const sections = key === 'sections' ? items : search?.sections;

    if (!terms?.length && !sections?.length) {
      setFieldValue('targeting.search', undefined);
      return;
    }

    setFieldValue('targeting.search', {
      ...search,
      terms: terms?.length ? terms : undefined,
      sections: sections?.length ? sections : undefined,
    });
  }

  return (
    <>
      <div className="ef-row">
        <div className="ef-field">
          <label>Возраст от</label>
          <input
            type="number"
            className="ef-input mono"
            min={0}
            value={targeting.minAge ?? ''}
            onChange={(e) => setFieldValue('targeting.minAge', e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="—"
          />
          <FieldError name="targeting.minAge" />
        </div>
        <div className="ef-field">
          <label>Возраст до</label>
          <input
            type="number"
            className="ef-input mono"
            min={0}
            value={targeting.maxAge ?? ''}
            onChange={(e) => setFieldValue('targeting.maxAge', e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="—"
          />
          <FieldError name="targeting.maxAge" />
        </div>
        <div className="ef-field">
          <label>Регионы</label>
          <SlugListField name="targeting.regions" placeholder="sukhum, gagra" />
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
                  checked={targeting.subscriptionLevels?.includes(lvl) ?? false}
                  onChange={(e) => {
                    const cur  = targeting.subscriptionLevels ?? [];
                    const next = e.target.checked ? [...cur, lvl] : cur.filter((x) => x !== lvl);
                    setFieldValue('targeting.subscriptionLevels', next.length ? next : undefined);
                  }}
                />
                {lvl}
              </label>
            );
          })}
        </div>
        {targeting.subscriptionLevels?.includes('none') && (
          <span className="ef-hint">
            none = не-PRO, включая гостей. Чтобы отсечь гостей, поставьте аудиторию «Только залогиненные».
          </span>
        )}
      </div>

      <div className="ef-divider" />
      <div className="ef-label">Поиск</div>
      <div className="ef-row">
        <div className="ef-field">
          <label>Поисковые фразы</label>
          <SearchListInput
            value={search?.terms}
            onChange={(items) => setSearchCriteria('terms', items)}
            placeholder="toyota camry, семейный автомобиль"
          />
          <FieldError name="targeting.search.terms" />
        </div>
        <div className="ef-field">
          <label>Разделы поиска</label>
          <SearchListInput
            value={search?.sections}
            onChange={(items) => setSearchCriteria('sections', items)}
            placeholder="avto, realty"
          />
          <FieldError name="targeting.search.sections" />
        </div>
        <div className="ef-field">
          <label>Период</label>
          <select
            className="ef-input"
            value={search?.lookbackDays ?? 30}
            disabled={!searchEnabled}
            onChange={(event) =>
              setFieldValue('targeting.search', {
                ...search,
                lookbackDays: Number(event.target.value),
              })
            }
          >
            <option value={1}>1 день</option>
            <option value={7}>7 дней</option>
            <option value={14}>14 дней</option>
            <option value={30}>30 дней</option>
          </select>
          <FieldError name="targeting.search.lookbackDays" />
        </div>
        <div className="ef-field">
          <label>Совпадение</label>
          <select
            className="ef-input"
            value={search?.match ?? 'any'}
            disabled={!searchEnabled}
            onChange={(event) =>
              setFieldValue('targeting.search', {
                ...search,
                match: event.target.value as 'any' | 'all',
              })
            }
          >
            <option value="any">Хотя бы одна</option>
            <option value="all">Все</option>
          </select>
          <FieldError name="targeting.search.match" />
        </div>
      </div>
      <span className="ef-hint">
        Учитываются запросы пользователя за выбранный период. Если фразы и разделы пусты, фильтр выключен.
      </span>

      <div className="ef-row">
        <div className="ef-field">
          <label>Разделы</label>
          <SlugListField name="sections" placeholder="avto, realty" />
          <span className="ef-hint">
            Работает только на overlay-поверхности; на topline/tooltip промо с разделами не показывается.
          </span>
        </div>
        <div className="ef-field">
          <label>Категории</label>
          <SlugListField name="categories" placeholder="kvartiry" />
        </div>
        <div className="ef-field">
          <label>По объявлениям</label>
          <select
            className="ef-input"
            value={values.sellerStatus ?? ''}
            onChange={(e) =>
              setFieldValue('sellerStatus', e.target.value === '' ? undefined : e.target.value)
            }
          >
            <option value="">Всем</option>
            <option value="seller">Продавцам</option>
            <option value="buyer">Покупателям</option>
          </select>
        </div>
      </div>

      <div className="ef-row">
        <div className="ef-field">
          <label>Аудитория</label>
          <select
            className="ef-input"
            value={values.audience ?? 'all'}
            onChange={(e) => setFieldValue('audience', e.target.value)}
          >
            <option value="all">Все</option>
            <option value="authenticated">Только залогиненные</option>
            <option value="anonymous">Только гости</option>
          </select>
        </div>
      </div>
    </>
  );
}
