'use client';
import { useEffect, useRef, useState } from 'react';
import { useFormikContext } from 'formik';
import {
  toggleEnumValue,
  OS_OPTIONS, ENVIRONMENT_OPTIONS, DEVICE_BRAND_OPTIONS,
  OS_HINT, ENVIRONMENT_HINT, DEVICE_BRAND_HINT,
} from '../env-targeting';
import { type EntrySource, type Promo } from '@/lib/schema';
import { SlugListField, FieldError } from '../fields';
import { HintIcon } from '../HintIcon';

/** IP-гео (спека targeting-geo §2): чекбоксы сегментов «где юзер СЕЙЧАС». */
const GEO_SEGMENT_OPTIONS = [
  { value: 'local', label: 'Местные (Абхазия)' },
  { value: 'tourist', label: 'Туристы (Россия)' },
  { value: 'other', label: 'Другое' },
] as const;

const ENTRY_SOURCE_LABELS: Record<EntrySource, string> = {
  direct: 'Прямой',
  search: 'Поиск',
  telegram: 'Telegram',
  other: 'Другое',
};

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

/** Возраст/регионы/подписки/поиск/поведение/пакеты/кошелёк/sections/categories/sellerStatus/объявления продавца/lifecycle/audience. */
export function TargetingSection() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;
  const search = targeting.search;
  const purchases = targeting.purchases;
  const balance = targeting.balance;
  const behavior = targeting.behavior;
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
        <label>
          Уровни подписки
          <HintIcon
            label="Уровни подписки"
            text="none = не-PRO, ВКЛЮЧАЯ гостей. Чтобы отсечь гостей, поставьте аудиторию «Только залогиненные». premium не поддерживается биллингом (billing-service отдаёт только plus/none)."
          />
        </label>
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
      </div>

      <div className="ef-divider" />
      <div className="ef-label">
        Гео по IP
        <HintIcon
          label="Гео по IP"
          text={
            <>
              Определяется по IP в момент показа. Если гео определить не удалось (VPN,
              неизвестная сеть), промо с гео-ограничением НЕ показывается. Ограничение
              метода: местный с российской SIM (роуминг) определится как турист.
              {' '}Не путать с «Регионы»: там — город из ПРОФИЛЯ пользователя, здесь —
              где он находится СЕЙЧАС по IP. Пусто = без гео-ограничения.
            </>
          }
        />
      </div>
      <div className="ef-field">
        <label>Сегменты</label>
        <div className="ef-checkbox-row">
          {GEO_SEGMENT_OPTIONS.map((opt) => (
            <label key={opt.value} className="ef-checkbox">
              <input
                type="checkbox"
                checked={targeting.geoSegments?.includes(opt.value) ?? false}
                onChange={(e) =>
                  setFieldValue('targeting.geoSegments', toggleEnumValue(targeting.geoSegments, opt.value, e.target.checked))
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      <div className="ef-field">
        <label>Города</label>
        <SlugListField name="targeting.geoCities" placeholder="sukhum, gagra, sochi" />
        <FieldError name="targeting.geoCities" />
      </div>

      <div className="ef-divider" />
      <div className="ef-label">
        Поиск
        <HintIcon
          label="Поиск"
          text="Учитываются запросы пользователя за выбранный период. Если фразы и разделы пусты, фильтр выключен."
        />
      </div>
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
      {/* Поведение зрителя (спека targeting-behavior §2): интересы по РЕАЛЬНО
          открытым объявлениям (не по поиску), горячий покупатель, вовлечённость
          визита. Три независимых AND-условия; пустой блок вычищается в
          to-persisted.ts. */}
      <div className="ef-divider" />
      <div className="ef-label">Поведение</div>
      <div className="ef-row">
        <div className="ef-field">
          <label>
            Смотрел категории
            <HintIcon
              label="Смотрел категории"
              text="Интересы — по объявлениям, которые зритель РЕАЛЬНО открывал за последние N дней (пустое поле = 7). Слаги категорий каталога — как в поле «Категории». Не путать с блоком «Поиск»: там — что человек набирал, здесь — что смотрел."
            />
          </label>
          <SlugListField name="targeting.behavior.interest.categories" placeholder="shiny, avto" />
          <FieldError name="targeting.behavior.interest.categories" />
        </div>
        <div className="ef-field">
          <label>За период, дней</label>
          <input
            type="number" className="ef-input mono" min={1} max={14} placeholder="7"
            disabled={!behavior?.interest?.categories?.length}
            value={behavior?.interest?.lookbackDays ?? ''}
            onChange={(e) => setFieldValue('targeting.behavior.interest.lookbackDays',
              e.target.value === '' ? undefined : Number(e.target.value))}
          />
          <FieldError name="targeting.behavior.interest.lookbackDays" />
        </div>
      </div>
      <div className="ef-row">
        <div className="ef-field">
          <label className="ef-checkbox">
            <input
              type="checkbox"
              checked={behavior?.hotBuyer !== undefined}
              onChange={(e) =>
                setFieldValue('targeting.behavior.hotBuyer', e.target.checked ? {} : undefined)
              }
            />
            {' '}Горячий покупатель
          </label>
          <HintIcon
            label="Горячий покупатель и карточки за визит"
            text="Горячий покупатель: открывал телефон продавца не меньше N раз (разных объявлений, пусто = 2) за последние 7 дней — окно фиксировано. Анонимов с историей тоже находит. Карточки за визит — открытые карточки объявлений текущего визита (перерыв больше 30 минут = новый визит), работает и для гостей. Любое из условий сужает аудиторию: без накопленной истории промо не показывается."
          />
        </div>
        {behavior?.hotBuyer !== undefined && (
          <div className="ef-field">
            <label>Открывал телефонов, минимум</label>
            <input
              type="number" className="ef-input mono" min={1} max={50} placeholder="2"
              value={behavior.hotBuyer.minPhoneViews ?? ''}
              onChange={(e) => setFieldValue('targeting.behavior.hotBuyer.minPhoneViews',
                e.target.value === '' ? undefined : Number(e.target.value))}
            />
            <FieldError name="targeting.behavior.hotBuyer.minPhoneViews" />
          </div>
        )}
        <div className="ef-field">
          <label>Показывать после N карточек за визит</label>
          <input
            type="number" className="ef-input mono" min={1} max={100} placeholder="—"
            value={behavior?.minSessionViews ?? ''}
            onChange={(e) => setFieldValue('targeting.behavior.minSessionViews',
              e.target.value === '' ? undefined : Number(e.target.value))}
          />
          <FieldError name="targeting.behavior.minSessionViews" />
        </div>
      </div>

      <div className="ef-divider" />
      <div className="ef-label">
        Покупки пакетов
        <HintIcon
          label="Покупки пакетов"
          text="Смотрит покупки VIP/premium/bump-пакетов за выбранный период. Если ничего не выбрано, фильтр выключен."
        />
      </div>
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

      <div className="ef-divider" />
      <div className="ef-label">
        Кошелёк
        <HintIcon
          label="Кошелёк"
          text="Остаток — текущий баланс кошелька. Движение — без указания окна считается с момента создания кошелька."
        />
      </div>
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
          <label>
            Движение от, ₽
            <HintIcon label="Движение" text="Пополнения минус траты за период." />
          </label>
          <input
            type="number" className="ef-input mono"
            value={balance?.movementAbove !== undefined ? balance.movementAbove / 100 : ''}
            onChange={(e) => setFieldValue('targeting.balance', {
              ...balance,
              movementAbove: e.target.value === '' ? undefined : Math.round(Number(e.target.value) * 100),
            })}
            placeholder="—"
          />
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

      <div className="ef-row">
        <div className="ef-field">
          <label>
            Разделы
            <HintIcon
              label="Разделы"
              text="Работает только на overlay-поверхности; на topline/tooltip промо с разделами не показывается."
            />
          </label>
          <SlugListField name="sections" placeholder="avto, realty" />
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
      <div className="ef-label">
        Объявления продавца
        <HintIcon
          label="Объявления продавца"
          text="Пустой блок — фильтр по объявлениям продавца выключен."
        />
      </div>
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

      {/* Жизненный цикл продавца (спека targeting-lifecycle §2): стадия
          собственных объявлений зрителя. Четыре независимых AND-условия;
          пустой блок схлопывает compactLifecycle (lib/lifecycle.ts). */}
      <div className="ef-divider" />
      <div className="ef-label">
        Жизненный цикл продавца
        <HintIcon
          label="Жизненный цикл продавца"
          text="Условия по собственным объявлениям зрителя; все заданные должны совпасть одновременно (И). Работает только для залогиненных — анонимам такие промо не показываются."
        />
      </div>
      <div className="ef-field">
        <FieldError name="lifecycle" />
      </div>
      <div className="ef-row">
        <div className="ef-field">
          <label>Продаёт в категориях</label>
          <SlugListField name="lifecycle.activeInCategories" placeholder="avto" />
          <FieldError name="lifecycle.activeInCategories" />
        </div>
        <div className="ef-field">
          <label>Продал за последние N дней</label>
          <input
            type="number" className="ef-input mono" min={1} max={90} placeholder="14"
            value={values.lifecycle?.soldWithinDays ?? ''}
            onChange={(e) => setFieldValue('lifecycle.soldWithinDays',
              e.target.value === '' ? undefined : Number(e.target.value))}
          />
          <FieldError name="lifecycle.soldWithinDays" />
        </div>
        <div className="ef-field">
          <label>Первое объявление не старше N дней</label>
          <input
            type="number" className="ef-input mono" min={1} max={30} placeholder="7"
            value={values.lifecycle?.firstListingWithinDays ?? ''}
            onChange={(e) => setFieldValue('lifecycle.firstListingWithinDays',
              e.target.value === '' ? undefined : Number(e.target.value))}
          />
          <FieldError name="lifecycle.firstListingWithinDays" />
        </div>
      </div>
      <div className="ef-field">
        <label className="ef-checkbox">
          <input
            type="checkbox"
            checked={values.lifecycle?.hasStalledActive === true}
            onChange={(e) => setFieldValue('lifecycle.hasStalledActive',
              e.target.checked ? true : undefined)}
          />
          {' '}Объявление зависло
        </label>
        <HintIcon
          label="Объявление зависло"
          text="Зависло = активно 30+ дней и меньше 50 просмотров; пороги — константы системы (меняются деплоем BFF, не настраиваются здесь). «Продал за N дней» начинает набирать аудиторию только с продаж после выката (историю не восстанавливаем)."
        />
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

      {/* Профиль визита (спека targeting-visit-profile §2). */}
      <div className="ef-divider" />
      <div className="ef-label">
        Профиль визита
        <HintIcon
          label="Профиль визита"
          text="Новичок: аккаунт (для залогиненных) или браузер (для гостей) моложе N дней. Постоянный: заходил не менее M разных дней за последний месяц. Если сигнала о посетителе нет (куки отключены) — промо с этим таргетингом просто не показывается. Пустое поле порога = дефолт (7 / 5 дней)."
        />
      </div>
      <div className="ef-row">
        <div className="ef-field">
          <label>Класс посетителя</label>
          <select
            className="ef-input"
            value={targeting.visitorClass ?? ''}
            onChange={(e) => {
              const next = e.target.value === '' ? undefined : (e.target.value as 'newcomer' | 'regular');
              setFieldValue('targeting.visitorClass', next);
              // Пороги чужого класса не таскаем за собой (normalize вычистит,
              // но форма не должна показывать устаревшее значение).
              if (next !== 'newcomer') setFieldValue('targeting.newcomerMaxAgeDays', undefined);
              if (next !== 'regular') setFieldValue('targeting.regularMinVisitDays', undefined);
            }}
          >
            <option value="">Любой</option>
            <option value="newcomer">Новички</option>
            <option value="regular">Постоянные</option>
          </select>
        </div>
        {targeting.visitorClass === 'newcomer' && (
          <div className="ef-field">
            <label>Новичок — моложе, дней</label>
            <input
              type="number" className="ef-input mono" min={1} max={365} placeholder="7"
              value={targeting.newcomerMaxAgeDays ?? ''}
              onChange={(e) => setFieldValue('targeting.newcomerMaxAgeDays', e.target.value === '' ? undefined : Number(e.target.value))}
            />
            <FieldError name="targeting.newcomerMaxAgeDays" />
          </div>
        )}
        {targeting.visitorClass === 'regular' && (
          <div className="ef-field">
            <label>Постоянный — от, дней с визитами</label>
            <input
              type="number" className="ef-input mono" min={1} max={30} placeholder="5"
              value={targeting.regularMinVisitDays ?? ''}
              onChange={(e) => setFieldValue('targeting.regularMinVisitDays', e.target.value === '' ? undefined : Number(e.target.value))}
            />
            <FieldError name="targeting.regularMinVisitDays" />
          </div>
        )}
      </div>

      {/* «Источник захода» (entrySources) из формы убран по фидбеку владельца:
          дублировал ось «Среда» (Telegram в обоих). Поле живёт в схеме и
          to-persisted ради обратной совместимости; у промо с уже сохранённым
          значением показываем компактную строку с возможностью очистить —
          значение не теряется молча. */}
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

      {/* Среда и устройство (спека targeting-device-env §2): три независимые
          AND-группы; пусто = показывать всем. Поля редактируемы и в edit-режиме —
          это правила отбора, а не структура креатива (в отличие от deviceTarget). */}
      <div className="ef-field">
        <label>
          Операционная система
          <HintIcon label="Операционная система" text={OS_HINT} />
        </label>
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
      </div>

      <div className="ef-field">
        <label>
          Среда
          <HintIcon label="Среда" text={ENVIRONMENT_HINT} />
        </label>
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
      </div>

      <div className="ef-field">
        <label>
          Класс устройства
          <HintIcon label="Класс устройства" text={DEVICE_BRAND_HINT} />
        </label>
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
      </div>
    </>
  );
}
