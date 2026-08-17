'use client';
import { useEffect, useRef, useState } from 'react';
import { useFormikContext } from 'formik';
import {
  toggleEnumValue,
  OS_OPTIONS, ENVIRONMENT_OPTIONS, DEVICE_BRAND_OPTIONS,
  OS_HINT, ENVIRONMENT_HINT, DEVICE_BRAND_HINT,
} from '../env-targeting';
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

/** Возраст/регионы/подписки/поиск/пакеты/кошелёк/sections/categories/sellerStatus/объявления продавца/audience. */
export function TargetingSection() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;
  const search = targeting.search;
  const purchases = targeting.purchases;
  const balance = targeting.balance;
  const listings = targeting.listings;
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

      <div className="ef-divider" />
      <div className="ef-label">Покупки пакетов</div>
      <div className="ef-row">
        <div className="ef-field">
          <label>Наличие покупок</label>
          <select
            className="ef-input"
            value={purchases?.purchased === undefined ? '' : String(purchases.purchased)}
            onChange={(e) => {
              const v = e.target.value;
              setFieldValue('targeting.purchases', {
                ...purchases,
                purchased: v === '' ? undefined : v === 'true',
              });
            }}
          >
            <option value="">Не важно</option>
            <option value="true">Были покупки</option>
            <option value="false">Не было покупок</option>
          </select>
        </div>
        <div className="ef-field">
          <label>Виды пакетов</label>
          <div className="ef-checkbox-row">
            {(['bump', 'premium', 'vip'] as const).map((pack) => (
              <label key={pack} className="ef-checkbox">
                <input
                  type="checkbox"
                  checked={purchases?.packTypes?.includes(pack) ?? false}
                  onChange={(e) => {
                    const cur = purchases?.packTypes ?? [];
                    const next = e.target.checked ? [...cur, pack] : cur.filter((x) => x !== pack);
                    setFieldValue('targeting.purchases', { ...purchases, packTypes: next.length ? next : undefined });
                  }}
                />
                {pack}
              </label>
            ))}
          </div>
        </div>
        <div className="ef-field">
          <label>Мин. сумма, ₽</label>
          <input
            type="number" min={0} className="ef-input mono"
            value={purchases?.minTotalKopecks !== undefined ? purchases.minTotalKopecks / 100 : ''}
            onChange={(e) => setFieldValue('targeting.purchases', {
              ...purchases,
              minTotalKopecks: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100),
            })}
            placeholder="—"
          />
          <FieldError name="targeting.purchases.minTotalKopecks" />
        </div>
        <div className="ef-field">
          <label>Мин. количество</label>
          <input
            type="number" min={0} className="ef-input mono"
            value={purchases?.minCount ?? ''}
            onChange={(e) => setFieldValue('targeting.purchases', {
              ...purchases,
              minCount: e.target.value === '' ? undefined : Number(e.target.value),
            })}
            placeholder="—"
          />
          <FieldError name="targeting.purchases.minCount" />
        </div>
        <div className="ef-field">
          <label>Период, дней</label>
          <input
            type="number" min={1} max={365} className="ef-input mono"
            value={purchases?.lookbackDays ?? 30}
            onChange={(e) => setFieldValue('targeting.purchases', {
              ...purchases,
              lookbackDays: Number(e.target.value),
            })}
          />
          <FieldError name="targeting.purchases.lookbackDays" />
        </div>
      </div>
      <span className="ef-hint">
        Смотрит покупки VIP/premium/bump-пакетов за выбранный период. Если ничего не выбрано, фильтр выключен.
      </span>

      <div className="ef-divider" />
      <div className="ef-label">Кошелёк</div>
      <div className="ef-row">
        <div className="ef-field">
          <label>Остаток от, ₽</label>
          <input
            type="number" className="ef-input mono"
            value={balance?.currentAbove !== undefined ? balance.currentAbove / 100 : ''}
            onChange={(e) => setFieldValue('targeting.balance', {
              ...balance,
              currentAbove: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100),
            })}
            placeholder="—"
          />
        </div>
        <div className="ef-field">
          <label>Остаток до, ₽</label>
          <input
            type="number" className="ef-input mono"
            value={balance?.currentBelow !== undefined ? balance.currentBelow / 100 : ''}
            onChange={(e) => setFieldValue('targeting.balance', {
              ...balance,
              currentBelow: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100),
            })}
            placeholder="—"
          />
        </div>
        <div className="ef-field">
          <label>Движение от, ₽</label>
          <input
            type="number" className="ef-input mono"
            value={balance?.movementAbove !== undefined ? balance.movementAbove / 100 : ''}
            onChange={(e) => setFieldValue('targeting.balance', {
              ...balance,
              movementAbove: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100),
            })}
            placeholder="—"
          />
          <span className="ef-hint">Пополнения минус траты за период</span>
        </div>
        <div className="ef-field">
          <label>Движение до, ₽</label>
          <input
            type="number" className="ef-input mono"
            value={balance?.movementBelow !== undefined ? balance.movementBelow / 100 : ''}
            onChange={(e) => setFieldValue('targeting.balance', {
              ...balance,
              movementBelow: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100),
            })}
            placeholder="—"
          />
        </div>
        <div className="ef-field">
          <label>Окно движения, дней</label>
          <input
            type="number" min={1} max={365} className="ef-input mono"
            value={balance?.movementLookbackDays ?? ''}
            onChange={(e) => setFieldValue('targeting.balance', {
              ...balance,
              movementLookbackDays: e.target.value === '' ? undefined : Number(e.target.value),
            })}
            placeholder="за всё время"
          />
          <FieldError name="targeting.balance.movementLookbackDays" />
        </div>
      </div>
      <span className="ef-hint">
        Остаток — текущий баланс кошелька. Движение — без указания окна считается с момента создания кошелька.
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

      <div className="ef-divider" />
      <div className="ef-label">Объявления продавца</div>
      <div className="ef-row">
        <div className="ef-field">
          <label>Категории (когда-либо размещал)</label>
          <SlugListField name="targeting.listings.categories" placeholder="avto, realty" />
        </div>
        <div className="ef-field">
          <label>Активные категории</label>
          <SlugListField name="targeting.listings.activeCategories" placeholder="avto" />
        </div>
        <div className="ef-field">
          <label>Совпадение категорий</label>
          <select
            className="ef-input"
            value={listings?.categoriesMatch ?? 'any'}
            onChange={(e) =>
              setFieldValue('targeting.listings', {
                ...listings,
                categoriesMatch: e.target.value as 'any' | 'all',
              })
            }
          >
            <option value="any">Хотя бы одна</option>
            <option value="all">Все</option>
          </select>
        </div>
      </div>
      <div className="ef-row">
        <div className="ef-field">
          <label>
            <input
              type="checkbox"
              checked={listings?.hasUnpromotedActive ?? false}
              onChange={(e) =>
                setFieldValue('targeting.listings', {
                  ...listings,
                  hasUnpromotedActive: e.target.checked ? true : undefined,
                })
              }
            />
            {' '}Есть активное объявление без продвижения
          </label>
        </div>
        <div className="ef-field">
          <label>Не размещал ≥ дней</label>
          <input
            type="number"
            className="ef-input mono"
            min={0}
            value={listings?.inactiveDays ?? ''}
            onChange={(e) =>
              setFieldValue('targeting.listings', {
                ...listings,
                inactiveDays: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder="—"
          />
          <FieldError name="targeting.listings.inactiveDays" />
        </div>
      </div>
      <span className="ef-hint">
        Пустой блок — фильтр по объявлениям продавца выключен.
      </span>

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

      {/* Среда и устройство (спека targeting-device-env §2): три независимые
          AND-группы; пусто = показывать всем. Поля редактируемы и в edit-режиме —
          это правила отбора, а не структура креатива (в отличие от deviceTarget). */}
      <div className="ef-field">
        <label>Операционная система</label>
        <div className="ef-checkbox-row">
          {OS_OPTIONS.map((opt) => (
            <label key={opt.value} className="ef-checkbox">
              <input
                type="checkbox"
                checked={targeting.os?.includes(opt.value) ?? false}
                onChange={(e) =>
                  setFieldValue('targeting.os', toggleEnumValue(targeting.os, opt.value, e.target.checked))
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
        <span className="ef-hint">{OS_HINT}</span>
      </div>

      <div className="ef-field">
        <label>Среда</label>
        <div className="ef-checkbox-row">
          {ENVIRONMENT_OPTIONS.map((opt) => (
            <label key={opt.value} className="ef-checkbox">
              <input
                type="checkbox"
                checked={targeting.environments?.includes(opt.value) ?? false}
                onChange={(e) =>
                  setFieldValue('targeting.environments', toggleEnumValue(targeting.environments, opt.value, e.target.checked))
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
        <span className="ef-hint">{ENVIRONMENT_HINT}</span>
      </div>

      <div className="ef-field">
        <label>Класс устройства</label>
        <div className="ef-checkbox-row">
          {DEVICE_BRAND_OPTIONS.map((opt) => (
            <label key={opt.value} className="ef-checkbox">
              <input
                type="checkbox"
                checked={targeting.deviceBrands?.includes(opt.value) ?? false}
                onChange={(e) =>
                  setFieldValue('targeting.deviceBrands', toggleEnumValue(targeting.deviceBrands, opt.value, e.target.checked))
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
        <span className="ef-hint">{DEVICE_BRAND_HINT}</span>
      </div>
    </>
  );
}
