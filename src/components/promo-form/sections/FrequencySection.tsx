'use client';
import { useState } from 'react';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { FieldError } from '../fields';

/** maxImpressionsPerUser, cooldownHours (both inside the advanced disclosure)
 *  + afterPromoId chain toggle with the predecessor <datalist> (own top-level
 *  block, always visible — mirrors the monolith). */
export function FrequencyCapFields() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
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
  );
}

/** Chain — «показывать только после другого промо» (все форматы). Чекбокс
 *  выключен → afterPromoId убирается из объекта. BFF (ChainChecker) отдаст
 *  это промо только после зафиксированного показа предшественника. */
export function FrequencySection({ poolPromos }: { poolPromos: { id: string; title: string }[] }) {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const [chainOn, setChainOn] = useState<boolean>(Boolean(values.afterPromoId));

  return (
    <section className="ef-block">
      <div className="ef-label">ЦЕПОЧКА ПОКАЗОВ</div>
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
    </section>
  );
}
