'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { KNOWN_CUSTOM_VARIANTS } from '@/lib/custom-variants';
import { CheckboxField, FieldError } from '../fields';

/** custom: variant (обязателен, из KNOWN_CUSTOM_VARIANTS), dismissible, плюс
 *  per-variant контентные поля (сейчас только referral-invite). Визуал
 *  целиком у хоста (customFormats на <PromoProvider>) — эти поля не
 *  рендерятся на сайте промо-рендерером, их читает только BFF (зеркало в
 *  referral_config) или сам host-компонент напрямую. */
export function CustomContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <>
      <section className="ef-block">
        <div className="ef-label">ВАРИАНТ</div>
        <select
          className="ef-input"
          value={values.variant ?? ''}
          onChange={(e) => setFieldValue('variant', e.target.value || undefined)}
        >
          <option value="">Выберите вариант…</option>
          {KNOWN_CUSTOM_VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        <FieldError name="variant" />
        {values.variant ? (
          <div className="hint">
            {KNOWN_CUSTOM_VARIANTS.find((v) => v.id === values.variant)?.description}
          </div>
        ) : (
          <div className="hint hint-warn">Выберите вариант host-компонента.</div>
        )}
      </section>
      <CheckboxField name="dismissible" label='Можно закрыть кнопкой «×»' />
      {values.variant === 'referral-invite' && <ReferralInviteFields />}
    </>
  );
}

/** ₽ на вводе ↔ копейки в стейте формы (как price_kopecks в abkhaz) — тот же
 *  паттерн, что и денежные поля storefront-а. undefined/'' на вводе → undefined
 *  в стейте (поле необязательно, BFF/referral_config не тронет его при sync,
 *  если оно вообще есть в базе — но форма всегда шлёт то, что реально введено). */
function RublesField({
  name, label, hint,
}: { name: string; label: string; hint?: string }) {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const kopecks = (values as Record<string, unknown>)[name] as number | undefined;
  const rubles = kopecks === undefined ? '' : String(kopecks / 100);
  return (
    <section className="ef-block">
      <div className="ef-label">{label}</div>
      <input
        className="ef-input mono"
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={rubles}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') { setFieldValue(name, undefined); return; }
          const num = Number(raw);
          if (!Number.isFinite(num)) return;
          setFieldValue(name, Math.round(num * 100));
        }}
      />
      {hint && <div className="hint">{hint}</div>}
      <FieldError name={name} />
    </section>
  );
}

function IntegerField({
  name, label, hint,
}: { name: string; label: string; hint?: string }) {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const val = (values as Record<string, unknown>)[name] as number | undefined;
  return (
    <section className="ef-block">
      <div className="ef-label">{label}</div>
      <input
        className="ef-input mono"
        type="number"
        min={0}
        step={1}
        value={val ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') { setFieldValue(name, undefined); return; }
          const num = Number(raw);
          if (!Number.isFinite(num)) return;
          setFieldValue(name, Math.round(num));
        }}
      />
      {hint && <div className="hint">{hint}</div>}
      <FieldError name={name} />
    </section>
  );
}

/** Поля варианта `referral-invite` — зеркалятся promo-bff (best-effort,
 *  идемпотентный upsert id=1) в abkhaz-Supabase `referral_config` при
 *  сохранении промо. Кабинет сам в abkhaz-базу не пишет. */
function ReferralInviteFields() {
  const { values } = useFormikContext<Promo>();
  const dailyBudgetKopecks = (values as Record<string, unknown>).dailyBudgetKopecks as number | undefined;
  const budgetFrozen = values.referralActive === true && !dailyBudgetKopecks;
  return (
    <>
      <CheckboxField
        name="referralActive"
        label="Реферальная программа активна"
        title="Значение поля referral_config.active в abkhaz-Supabase"
      />
      <RublesField
        name="referralInviterCreditKopecks"
        label="Бонус приглашающему, ₽"
        hint="referral_config.inviter_credit_kopecks — хранится в копейках"
      />
      <RublesField
        name="referralSellerBonusKopecks"
        label="Бонус продавцу, ₽"
        hint="referral_config.seller_bonus_kopecks — хранится в копейках"
      />
      <IntegerField
        name="referralDailyInviteCap"
        label="Дневной лимит приглашений на пользователя"
        hint="referral_config.daily_invite_cap"
      />
      <IntegerField
        name="referralHoldHours"
        label="Задержка начисления, часы"
        hint="referral_config.hold_hours — сколько часов бонус остаётся в hold до зачисления"
      />
      <RublesField
        name="dailyBudgetKopecks"
        label="Дневной бюджет программы, ₽"
        hint="referral_config.daily_budget_kopecks — хранится в копейках, дефолт 1000₽/день"
      />
      {budgetFrozen && (
        <div className="hint hint-warn">
          ⚠️ Бюджет 0 ₽ — при активной программе выплаты заморожены (0 ₽/сутки).
          Поставьте бюджет больше 0, чтобы награды начислялись.
        </div>
      )}
    </>
  );
}
