'use client';
import { useState } from 'react';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { FieldError } from '../fields';

/** «Показы и лимиты»: цепочки (afterPromoId — после ПОКАЗА предшественника;
 *  afterClickPromoId — только КЛИКНУВШИМ по предшественнику; оба условия BFF
 *  применяет как И), анти-таргетинг suppressAfterClick (не показывать
 *  кликнувшим по себе) плюс лимит показов и кулдаун. Чекбокс выключен →
 *  соответствующее поле убирается из объекта. Один datalist на оба chain-поля. */
export function FrequencySection({ poolPromos }: { poolPromos: { id: string; title: string }[] }) {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const [chainOn, setChainOn] = useState<boolean>(Boolean(values.afterPromoId));
  const [clickChainOn, setClickChainOn] = useState<boolean>(Boolean(values.afterClickPromoId));

  return (
    <section className="ef-block">
      <div className="ef-label">ПОКАЗЫ И ЛИМИТЫ</div>
      <label className="ef-checkbox">
        <input
          type="checkbox"
          checked={chainOn}
          onChange={(e) => {
            setChainOn(e.target.checked);
            if (!e.target.checked) setFieldValue('afterPromoId', undefined);
          }}
        />
        Показывать только после другого промо
      </label>
      {chainOn && (
        <>
          <input
            className="ef-input mono"
            list="chain-promo-ids"
            value={values.afterPromoId ?? ''}
            onChange={(e) => setFieldValue('afterPromoId', e.target.value.trim() || undefined)}
            placeholder="id промо-предшественника"
            maxLength={64}
          />
          <datalist id="chain-promo-ids">
            {poolPromos
              .filter((pp) => pp.id !== values.id)
              .map((pp) => (
                <option key={pp.id} value={pp.id}>{`${pp.id} — ${pp.title}`}</option>
              ))}
          </datalist>
          <FieldError name="afterPromoId" />
          {values.afterPromoId && values.afterPromoId !== values.id &&
            !poolPromos.some((pp) => pp.id === values.afterPromoId) && (
            <div className="hint hint-warn">
              Промо с таким id нет в пуле — это промо не будет показываться.
            </div>
          )}
        </>
      )}

      <label className="ef-checkbox">
        <input
          type="checkbox"
          checked={clickChainOn}
          onChange={(e) => {
            setClickChainOn(e.target.checked);
            if (!e.target.checked) setFieldValue('afterClickPromoId', undefined);
          }}
        />
        Показывать только кликнувшим по другому промо
      </label>
      {clickChainOn && (
        <>
          <input
            className="ef-input mono"
            list="chain-promo-ids"
            value={values.afterClickPromoId ?? ''}
            onChange={(e) => setFieldValue('afterClickPromoId', e.target.value.trim() || undefined)}
            placeholder="id промо, по которому кликнули"
            maxLength={64}
          />
          <FieldError name="afterClickPromoId" />
          {values.afterClickPromoId && values.afterClickPromoId !== values.id &&
            !poolPromos.some((pp) => pp.id === values.afterClickPromoId) && (
            <div className="hint hint-warn">
              Промо с таким id нет в пуле — это промо не будет показываться.
            </div>
          )}
          {values.afterPromoId && values.afterClickPromoId && (
            <div className="ef-sublabel">Оба условия цепочки работают как И.</div>
          )}
        </>
      )}

      <label className="ef-checkbox">
        <input
          type="checkbox"
          checked={Boolean(values.suppressAfterClick)}
          onChange={(e) => setFieldValue('suppressAfterClick', e.target.checked || undefined)}
        />
        Не показывать кликнувшим (кто уже нажал кнопку — больше не увидит)
      </label>

      <div className="ef-row">
        <div className="ef-field">
          <label>Лимит показов на пользователя</label>
          <input
            type="number"
            className="ef-input mono"
            min={1}
            value={values.maxImpressionsPerUser ?? ''}
            onChange={(e) =>
              setFieldValue('maxImpressionsPerUser', e.target.value === '' ? undefined : Number(e.target.value))
            }
            placeholder="∞"
          />
          <FieldError name="maxImpressionsPerUser" />
        </div>
        <div className="ef-field">
          <label>Кулдаун (часов)</label>
          <input
            type="number"
            className="ef-input mono"
            min={0}
            value={values.cooldownHours}
            onChange={(e) => setFieldValue('cooldownHours', Number(e.target.value))}
          />
          <FieldError name="cooldownHours" />
        </div>
      </div>
    </section>
  );
}
