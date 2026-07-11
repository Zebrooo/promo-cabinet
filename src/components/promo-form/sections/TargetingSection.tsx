'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { SlugListField, FieldError } from '../fields';

/** Возраст/регионы/подписки/sections/categories/sellerStatus/audience. */
export function TargetingSection() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const targeting = values.targeting;

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
