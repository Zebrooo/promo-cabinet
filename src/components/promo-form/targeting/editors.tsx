'use client';
// Поля каждого фильтра таргетинга — ровно та разметка, что раньше лежала
// сплошной простынёй в TargetingSection. Редактор рендерится внутри
// развёрнутой карточки фильтра; какие карточки показаны, решает registry.
import { useEffect, useRef, useState } from 'react';
import { useFormikContext } from 'formik';
import {
  toggleEnumValue,
  OS_OPTIONS, ENVIRONMENT_OPTIONS, DEVICE_BRAND_OPTIONS,
  OS_HINT, ENVIRONMENT_HINT, DEVICE_BRAND_HINT,
} from '../env-targeting';
import type { Promo, PromoSchedule } from '@/lib/schema';
import { SlugListField, FieldError } from '../fields';
import { HintIcon } from '../HintIcon';
import { fullCoverage, weekdays9to18, weekendsOnly, roundTheClock } from '../schedule-presets';

const GEO_SEGMENT_OPTIONS = [
  { value: 'local', label: 'Местные (Абхазия)' },
  { value: 'tourist', label: 'Туристы (Россия)' },
  { value: 'other', label: 'Другое' },
] as const;

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']; // индекс i → ISO-день i+1
const HOURS_FROM = Array.from({ length: 24 }, (_, h) => h);     // 0..23
const HOURS_TO = Array.from({ length: 24 }, (_, h) => h + 1);   // 1..24
const fmtHour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

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

function AgeEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;
  return (
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
    </div>
  );
}

function RegionsEditor() {
  return (
    <div className="ef-field">
      <label>
        Регионы
        <HintIcon
          label="Регионы"
          text="Город из ПРОФИЛЯ пользователя. Не путать с «Гео по IP»: там — где человек находится сейчас."
        />
      </label>
      <SlugListField name="targeting.regions" placeholder="sukhum, gagra" />
    </div>
  );
}

function GeoEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;
  return (
    <>
      <div className="ef-field">
        <label>
          Сегменты
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
        </label>
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
    </>
  );
}

function VisitProfileEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;
  return (
    <div className="ef-row">
      <div className="ef-field">
        <label>
          Класс посетителя
          <HintIcon
            label="Профиль визита"
            text="Новичок: аккаунт (для залогиненных) или браузер (для гостей) моложе N дней. Постоянный: заходил не менее M разных дней за последний месяц. Если сигнала о посетителе нет (куки отключены) — промо с этим таргетингом просто не показывается. Пустое поле порога = дефолт (7 / 5 дней)."
          />
        </label>
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
  );
}

function BehaviorEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const behavior = values.targeting.behavior;
  return (
    <>
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
    </>
  );
}

function LifecycleEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <>
      <div className="ef-field">
        <FieldError name="lifecycle" />
      </div>
      <div className="ef-row">
        <div className="ef-field">
          <label>
            Продаёт в категориях
            <HintIcon
              label="Жизненный цикл продавца"
              text="Условия по собственным объявлениям зрителя; все заданные должны совпасть одновременно (И). Работает только для залогиненных — анонимам такие промо не показываются."
            />
          </label>
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
    </>
  );
}

/** Дейпартинг. Источник истины один — Formik: отсутствие поля рисуем как
 *  полное покрытие (все дни, 0–24); любое взаимодействие пишет цельный
 *  объект. «Круглосуточно» при сохранении нормализуется обратно в отсутствие
 *  поля (to-persisted.ts). */
function ScheduleEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const schedule: PromoSchedule = values.schedule ?? fullCoverage();
  const set = (next: PromoSchedule) => setFieldValue('schedule', next);
  return (
    <>
      <div className="ef-field">
        <label>
          Пресеты
          <HintIcon
            label="Расписание показов"
            text="Время московское (МСК, UTC+3). «До» — исключающая граница: с 9 до 18 = показы в 9:00–17:59. Интервалы через полночь не поддерживаются — делайте два промо. Все дни и 0–24 = без ограничений (поле не сохраняется)."
          />
        </label>
        <div className="ef-queues">
          <button type="button" className="qchip" onClick={() => set(weekdays9to18())}>
            Будни 9–18
          </button>
          <button type="button" className="qchip" onClick={() => set(weekendsOnly())}>
            Только выходные
          </button>
          <button type="button" className="qchip" onClick={() => set(roundTheClock())}>
            Круглосуточно
          </button>
        </div>
      </div>
      <div className="ef-field">
        <label>Дни недели</label>
        <div className="ef-queues">
          {DAY_LABELS.map((label, i) => {
            const day = i + 1;
            const on = schedule.daysOfWeek.includes(day);
            const last = on && schedule.daysOfWeek.length === 1; // снять последний день нельзя
            return (
              <button
                type="button"
                key={day}
                className={`qchip${on ? ' on' : ''}`}
                disabled={last}
                title={last ? 'Нужен хотя бы один день показа' : undefined}
                onClick={() => set({
                  ...schedule,
                  daysOfWeek: on
                    ? schedule.daysOfWeek.filter((d) => d !== day)
                    : [...schedule.daysOfWeek, day].sort((a, b) => a - b),
                })}
              >
                {label}
              </button>
            );
          })}
        </div>
        <FieldError name="schedule.daysOfWeek" />
      </div>
      <div className="ef-row">
        <div className="ef-field">
          <label>Показывать с</label>
          <select
            className="ef-input"
            value={schedule.hourStart}
            onChange={(e) => set({ ...schedule, hourStart: Number(e.target.value) })}
          >
            {HOURS_FROM.map((h) => (
              <option key={h} value={h}>{fmtHour(h)}</option>
            ))}
          </select>
          <FieldError name="schedule.hourStart" />
        </div>
        <div className="ef-field">
          <label>Показывать до</label>
          <select
            className="ef-input"
            value={schedule.hourEnd}
            onChange={(e) => set({ ...schedule, hourEnd: Number(e.target.value) })}
          >
            {HOURS_TO.map((h) => (
              <option key={h} value={h}>{h === 24 ? '24:00 (до полуночи)' : fmtHour(h)}</option>
            ))}
          </select>
          <FieldError name="schedule.hourEnd" />
        </div>
      </div>
    </>
  );
}

function SubscriptionEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;
  return (
    <div className="ef-field">
      <label>
        Уровни подписки
        <HintIcon
          label="Уровни подписки"
          text="premium не поддерживается биллингом — billing-service отдаёт только plus/none. none = не-PRO, включая гостей: чтобы отсечь гостей, добавьте фильтр «Гости и залогиненные» и поставьте «Только залогиненные»."
        />
      </label>
      <div className="ef-checkbox-row">
        {(['none', 'plus', 'premium'] as const).map((lvl) => {
          const disabled = lvl === 'premium';
          return (
            <label key={lvl} className={`ef-checkbox${disabled ? ' is-disabled' : ''}`}>
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
  );
}

function AudienceEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
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
  );
}

function SellerStatusEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <div className="ef-field">
      <label>По объявлениям</label>
      <select
        className="ef-input"
        value={values.sellerStatus ?? ''}
        onChange={(e) => setFieldValue('sellerStatus', e.target.value === '' ? undefined : e.target.value)}
      >
        <option value="">Всем</option>
        <option value="seller">Продавцам</option>
        <option value="buyer">Покупателям</option>
      </select>
    </div>
  );
}

function SearchEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const search = values.targeting.search;
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
          <label>
            Поисковые фразы
            <HintIcon
              label="Поиск"
              text="Учитываются запросы пользователя за выбранный период. Если фразы и разделы пусты, фильтр выключен."
            />
          </label>
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
    </>
  );
}

function PurchasesEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const purchases = values.targeting.purchases;
  return (
    <>
      <div className="ef-row">
        <div className="ef-field">
          <label>
            Наличие покупок
            <HintIcon
              label="Покупки пакетов"
              text="Смотрит покупки VIP/premium/bump-пакетов за выбранный период. Если ничего не выбрано, фильтр выключен."
            />
          </label>
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
    </>
  );
}

function ListingsEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const listings = values.targeting.listings;
  return (
    <>
      <div className="ef-row">
        <div className="ef-field">
          <label>
            Категории (когда-либо размещал)
            <HintIcon
              label="Объявления продавца"
              text="Пустой блок — фильтр по объявлениям продавца выключен."
            />
          </label>
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
    </>
  );
}

function BalanceEditor() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const balance = values.targeting.balance;
  return (
    <>
      <div className="ef-row">
        <div className="ef-field">
          <label>
            Остаток от, ₽
            <HintIcon
              label="Кошелёк"
              text="Остаток — текущий баланс кошелька. Движение — пополнения минус траты за период; без указания окна считается с момента создания кошелька."
            />
          </label>
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
    </>
  );
}

/** Три независимые AND-группы среды и устройства (спека targeting-device-env
 *  §2); пусто = показывать всем. Правила отбора, а не структура креатива —
 *  поэтому редактируемы и в edit-режиме, в отличие от deviceTarget. */
function EnumCheckboxEditor({
  label, path, options, hint, current,
}: {
  label: string;
  path: string;
  options: readonly { value: string; label: string }[];
  hint: string;
  current: readonly string[] | undefined;
}) {
  const { setFieldValue } = useFormikContext<Promo>();
  return (
    <div className="ef-field">
      <label>
        {label}
        <HintIcon label={label} text={hint} />
      </label>
      <div className="ef-checkbox-row">
        {options.map((opt) => (
          <label key={opt.value} className="ef-checkbox">
            <input
              type="checkbox"
              checked={current?.includes(opt.value) ?? false}
              onChange={(e) => setFieldValue(path, toggleEnumValue(current, opt.value, e.target.checked))}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function OsEditor() {
  const { values } = useFormikContext<Promo>();
  return (
    <EnumCheckboxEditor
      label="Операционная система"
      path="targeting.os"
      options={OS_OPTIONS}
      hint={OS_HINT}
      current={values.targeting.os}
    />
  );
}

function EnvironmentsEditor() {
  const { values } = useFormikContext<Promo>();
  return (
    <EnumCheckboxEditor
      label="Среда"
      path="targeting.environments"
      options={ENVIRONMENT_OPTIONS}
      hint={ENVIRONMENT_HINT}
      current={values.targeting.environments}
    />
  );
}

function DeviceBrandsEditor() {
  const { values } = useFormikContext<Promo>();
  return (
    <EnumCheckboxEditor
      label="Класс устройства"
      path="targeting.deviceBrands"
      options={DEVICE_BRAND_OPTIONS}
      hint={DEVICE_BRAND_HINT}
      current={values.targeting.deviceBrands}
    />
  );
}

function SectionsEditor() {
  return (
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
  );
}

function CategoriesEditor() {
  return (
    <div className="ef-field">
      <label>Категории</label>
      <SlugListField name="categories" placeholder="kvartiry" />
    </div>
  );
}

export const FILTER_EDITORS: Record<string, () => JSX.Element> = {
  age: AgeEditor,
  geo: GeoEditor,
  visitProfile: VisitProfileEditor,
  regions: RegionsEditor,
  behavior: BehaviorEditor,
  lifecycle: LifecycleEditor,
  schedule: ScheduleEditor,
  subscription: SubscriptionEditor,
  audience: AudienceEditor,
  sellerStatus: SellerStatusEditor,
  search: SearchEditor,
  purchases: PurchasesEditor,
  listings: ListingsEditor,
  balance: BalanceEditor,
  os: OsEditor,
  environments: EnvironmentsEditor,
  deviceBrands: DeviceBrandsEditor,
  sections: SectionsEditor,
  categories: CategoriesEditor,
};
