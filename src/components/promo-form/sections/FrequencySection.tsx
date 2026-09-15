'use client';
import { Fragment, useState } from 'react';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { FieldError } from '../fields';

/** «Показы и лимиты»: цепочки (afterPromoId — после ПОКАЗА предшественника;
 *  afterClickPromoId — только КЛИКНУВШИМ по предшественнику; оба условия BFF
 *  применяет как И), анти-таргетинг suppressAfterClick (не показывать
 *  кликнувшим по себе), плюс лимит показов, общая пауза формата в минутах и
 *  направленные паузы; устаревший cooldownHours не редактируется — только
 *  подсказка, пока новые поля пауз не заданы. Чекбокс выключен → соответствующее
 *  поле убирается из объекта. Один datalist на оба chain-поля. */
export function FrequencySection({ poolPromos }: { poolPromos: { id: string; title: string }[] }) {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const [chainOn, setChainOn] = useState<boolean>(Boolean(values.afterPromoId));
  const [clickChainOn, setClickChainOn] = useState<boolean>(Boolean(values.afterClickPromoId));
  const rules = values.cooldownPromos ?? [];
  const setRule = (index: number, next: { promoId: string; minutes: number }) =>
    setFieldValue('cooldownPromos', rules.map((r, i) => (i === index ? next : r)));
  const removeRule = (index: number) =>
    setFieldValue('cooldownPromos', rules.filter((_, i) => i !== index));
  const addRule = () => setFieldValue('cooldownPromos', [...rules, { promoId: '', minutes: 60 }]);
  const legacyHours = values.cooldownHours ?? 0;
  const hasNewCooldown = values.cooldownSelfMinutes !== undefined || rules.length > 0;

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
          <label>Пауза для формата после показа, минут</label>
          <input
            type="number"
            className="ef-input mono"
            min={0}
            step={1}
            value={values.cooldownSelfMinutes ?? ''}
            onChange={(e) =>
              setFieldValue('cooldownSelfMinutes', e.target.value === '' ? undefined : Number(e.target.value))
            }
            placeholder="нет"
          />
          <div className="ef-sublabel">{describeMinutes(values.cooldownSelfMinutes)}</div>
          <FieldError name="cooldownSelfMinutes" />
        </div>
      </div>

      <div className="ef-field">
        <label>Не показывать после промо</label>
        <div className="ef-sublabel">
          Пауза от показа указанного промо; своё промо в списке — «не повторять чаще N минут».
        </div>
        {(values.cooldownPromos ?? []).map((rule, index) => (
          <Fragment key={index}>
            <div className="ef-row">
              <input
                className="ef-input mono"
                list="cooldown-promo-ids"
                value={rule.promoId}
                onChange={(e) => setRule(index, { ...rule, promoId: e.target.value })}
                placeholder="id промо"
                maxLength={64}
              />
              <input
                type="number"
                className="ef-input mono"
                min={1}
                step={1}
                value={rule.minutes}
                onChange={(e) => setRule(index, { ...rule, minutes: Number(e.target.value) })}
                placeholder="минут"
              />
              <button type="button" className="ef-link-btn" onClick={() => removeRule(index)}>Убрать</button>
            </div>
            {rule.promoId.trim() && rule.promoId !== values.id &&
              !poolPromos.some((pp) => pp.id === rule.promoId) && (
              <div className="hint hint-warn">
                Промо с таким id нет в пуле — правило паузы не сработает.
              </div>
            )}
          </Fragment>
        ))}
        <datalist id="cooldown-promo-ids">
          {poolPromos.map((pp) => (
            <option key={pp.id} value={pp.id}>{`${pp.id} — ${pp.title}`}</option>
          ))}
        </datalist>
        <button type="button" className="ef-link-btn" onClick={addRule}>Добавить правило</button>
        <FieldError name="cooldownPromos" />
      </div>

      {legacyHours > 0 && !hasNewCooldown && (
        <div className="hint hint-warn">
          Устаревший кулдаун {legacyHours} ч. BFF читает его как паузу формата {legacyHours * 60} мин
          и правило «не повторять себя» {legacyHours * 60} мин. Чтобы отключить, введите 0 в поле паузы
          или задайте правило; чтобы заменить — задайте новые значения.
        </div>
      )}
    </section>
  );
}

/** «= 3 ч», «= 2 дн 4 ч»; пусто/0 — «пауз нет». */
function describeMinutes(minutes: number | undefined): string {
  if (!minutes) return 'пауз нет';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [days ? `${days} дн` : '', hours ? `${hours} ч` : '', rest ? `${rest} мин` : ''].filter(Boolean);
  return `= ${parts.join(' ')}`;
}
