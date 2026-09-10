'use client';
// Редактор пуш-рассылки. Formik, как у промо; таргетинг — тот же
// TargetingSection (реестр фильтров читает только оси targeting/audience/
// sellerStatus/sections/categories/schedule/lifecycle, все они есть в
// состоянии этой формы). Стили — EDITOR_CSS редактора промо.
//
//   ┌─ sticky page-bar ────────────────────────────────────────────┐
//   │ ← К списку рассылок      [Удалить] [Сохранить черновик] [Отправить пуш] │
//   ├──────────────────────────────────────────────────────────────┤
//   │ H1 «Новая рассылка» / «Редактирование рассылки»              │
//   │ ПУШ: заголовок, текст, ссылка, иконка                        │
//   │ ТАРГЕТИНГ (фильтры)                                          │
//   └──────────────────────────────────────────────────────────────┘
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Formik, Form, useFormikContext, setNestedObjectValues } from 'formik';
import {
  emptyPushCampaignForm, PUSH_BODY_MAX, PUSH_TITLE_MAX,
  type PushCampaign, type PushCampaignFormValues, type PushCampaignInput,
} from '@/lib/push-campaign-schema';
import { describePushError } from '@/lib/push-campaign-summary';
import { EDITOR_CSS } from '@/components/promo-form/editor-styles';
import { FieldError, scrollToFirstFieldError } from '@/components/promo-form/fields';
import { FormErrorSummary } from '@/components/promo-form/FormErrorSummary';
import { TargetingSection } from '@/components/promo-form/sections/TargetingSection';
import { PromoImageUpload } from '@/components/PromoImageUpload';
import { validatePushCampaignForm } from './validate';
import { toPushCampaignInput } from './to-persisted';

type Props = {
  initial?: PushCampaignFormValues;
  mode: 'create' | 'edit';
  /** false = BFF не настроен на рассылку: кнопка «Отправить» объясняет почему. */
  broadcastConfigured: boolean;
  /** Ошибка прошлой попытки отправки (черновик остался черновиком). */
  lastSendError?: string;
};

export function PushCampaignForm({ initial, mode, broadcastConfigured, lastSendError }: Props) {
  return (
    <Formik<PushCampaignFormValues>
      initialValues={initial ?? emptyPushCampaignForm()}
      validate={validatePushCampaignForm}
      onSubmit={() => { /* handled by FormBody — см. ниже */ }}
    >
      <FormBody mode={mode} broadcastConfigured={broadcastConfigured} lastSendError={lastSendError} />
    </Formik>
  );
}

type SaveOutcome = { ok: true; campaign: PushCampaign } | { ok: false; message: string };

async function saveDraft(input: PushCampaignInput): Promise<SaveOutcome> {
  let res: Response;
  try {
    res = await fetch('/api/push-campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, message: 'Сеть недоступна — проверьте соединение и повторите.' };
  }
  const data = (await res.json().catch(() => ({}))) as { campaign?: PushCampaign; error?: string; reason?: string };
  if (!res.ok || !data.campaign) return { ok: false, message: describePushError(res.status, data) };
  return { ok: true, campaign: data.campaign };
}

async function sendCampaign(id: string): Promise<SaveOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/push-campaigns/${encodeURIComponent(id)}/send`, { method: 'POST' });
  } catch {
    return { ok: false, message: 'Сеть недоступна — не удалось узнать, ушла ли рассылка. Обновите список перед повтором.' };
  }
  const data = (await res.json().catch(() => ({}))) as { campaign?: PushCampaign; error?: string; reason?: string };
  if (!res.ok || !data.campaign) return { ok: false, message: describePushError(res.status, data) };
  return { ok: true, campaign: data.campaign };
}

function FormBody({ mode, broadcastConfigured, lastSendError }: Omit<Props, 'initial'>) {
  const router = useRouter();
  const { values, errors, touched, handleChange, handleBlur, setFieldValue, setTouched, validateForm } =
    useFormikContext<PushCampaignFormValues>();

  const [error, setError] = useState('');
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [busy, setBusy] = useState<'save' | 'send' | 'delete' | null>(null);

  /** Валидация + нормализация; null = в форме ошибки (уже показаны). */
  async function prepare(): Promise<PushCampaignInput | null> {
    setError('');
    const formErrors = await validateForm();
    if (Object.keys(formErrors).length > 0) {
      // Вложенные пути (targeting.minAge, schedule.daysOfWeek) тоже должны
      // стать touched — иначе FieldError под ними не покажется.
      setTouched(setNestedObjectValues(formErrors, true), false);
      setShowFieldErrors(true);
      scrollToFirstFieldError();
      return null;
    }
    try {
      return toPushCampaignInput(values);
    } catch {
      setError('Проверьте поля формы — есть ошибки.');
      return null;
    }
  }

  async function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    const input = await prepare();
    if (!input) return;
    setBusy('save');
    const saved = await saveDraft(input);
    setBusy(null);
    if (!saved.ok) {
      setError(saved.message);
      return;
    }
    router.push('/cabinet/push'); router.refresh();
  }

  /** «Отправить пуш» = сохранить черновик (чтобы ушло именно то, что на
   *  экране) → подтверждение → отправка. Всем пользователям с FCM-токенами:
   *  фильтры таргетинга на первом этапе только сохраняются. */
  async function submitSend() {
    const input = await prepare();
    if (!input) return;
    const ok = confirm(
      `Отправить пуш «${input.title}» всем пользователям с включёнными уведомлениями?\n\n` +
      'Фильтры таргетинга пока сохраняются, но на получателей не влияют. Отменить рассылку после отправки нельзя.',
    );
    if (!ok) return;
    setBusy('send');
    const saved = await saveDraft(input);
    if (!saved.ok) {
      setBusy(null);
      setError(saved.message);
      return;
    }
    if (mode === 'create') setFieldValue('id', saved.campaign.id);
    const sent = await sendCampaign(saved.campaign.id);
    setBusy(null);
    if (!sent.ok) {
      // Черновик уже сохранён — при создании уводим на его страницу, чтобы
      // повторная попытка не плодила дубли.
      if (mode === 'create') { router.push(`/cabinet/push/${encodeURIComponent(saved.campaign.id)}?error=${encodeURIComponent(sent.message)}`); return; }
      setError(sent.message);
      return;
    }
    router.push('/cabinet/push'); router.refresh();
  }

  async function remove() {
    if (mode !== 'edit' || !values.id) return;
    if (!confirm(`Удалить черновик «${values.title || values.id}»?`)) return;
    setError('');
    setBusy('delete');
    let res: Response;
    try {
      res = await fetch(`/api/push-campaigns/${encodeURIComponent(values.id)}`, { method: 'DELETE' });
    } catch {
      setBusy(null);
      setError('Сеть недоступна — проверьте соединение и повторите.');
      return;
    }
    setBusy(null);
    if (res.ok) {
      router.push('/cabinet/push'); router.refresh(); return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(describePushError(res.status, data));
  }

  const disabled = busy !== null;
  const fieldError = (name: 'title' | 'body' | 'url' | 'icon') =>
    touched[name] && typeof errors[name] === 'string' ? errors[name] : '';

  return (
    <Form className="editor" onSubmit={submitDraft}>
      <div className="editor-bar">
        <Link href="/cabinet/push" className="editor-back">← К списку рассылок</Link>
        <div className="editor-actions">
          {mode === 'edit' && (
            <button type="button" className="ebtn ebtn-danger" disabled={disabled} onClick={remove}>
              {busy === 'delete' ? 'Удаляю…' : 'Удалить'}
            </button>
          )}
          <button type="submit" className="ebtn ebtn-ghost" disabled={disabled}>
            {busy === 'save' ? 'Сохраняю…' : 'Сохранить черновик'}
          </button>
          <button
            type="button"
            className="ebtn ebtn-primary"
            disabled={disabled || !broadcastConfigured}
            onClick={submitSend}
            title={broadcastConfigured ? 'Сохранить черновик и разослать пуш всем пользователям с токенами' : 'У BFF не настроена отправка (AA_BASE_URL / PROMO_TICKET_PRIVATE_KEY)'}
          >
            {busy === 'send' ? 'Отправляю…' : 'Отправить пуш'}
          </button>
        </div>
        {error && <div className="editor-bar-error" role="alert">{error}</div>}
        <FormErrorSummary active={showFieldErrors} />
      </div>

      <header className="editor-head">
        <h1>{mode === 'create' ? 'Новая push-рассылка' : 'Редактирование push-рассылки'}</h1>
        <div className="editor-meta mono">
          {mode === 'edit' ? `ID ${values.id} · черновик` : 'Заполните поля, сохраните черновик или отправьте сразу'}
        </div>
      </header>

      {!broadcastConfigured && (
        <div className="leads-warn">
          У BFF не заданы AA_BASE_URL / PROMO_TICKET_PRIVATE_KEY — черновики сохраняются, но отправить рассылку пока нельзя.
        </div>
      )}
      {lastSendError && (
        <div className="leads-warn">Прошлая отправка не удалась: {lastSendError}. Черновик не менялся — можно повторить.</div>
      )}

      <div className="editor-grid push-editor-grid">
        <div className="editor-main">
          <section className="ef-block">
            <div className="ef-label">ПУШ</div>

            <div className="ef-field">
              <div className="ef-label-row">
                <label htmlFor="push-title">Заголовок</label>
                <span className={`ef-counter${values.title.length > PUSH_TITLE_MAX ? ' over' : ''}`}>{values.title.length}/{PUSH_TITLE_MAX}</span>
              </div>
              <input
                id="push-title"
                className="ef-input title"
                name="title"
                value={values.title}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Скидка 20% на шины до воскресенья"
                disabled={disabled}
              />
              {fieldError('title') && <div className="hint hint-warn ef-field-error">{fieldError('title')}</div>}
            </div>

            <div className="ef-field">
              <div className="ef-label-row">
                <label htmlFor="push-body">Текст</label>
                <span className={`ef-counter${values.body.length > PUSH_BODY_MAX ? ' over' : ''}`}>{values.body.length}/{PUSH_BODY_MAX}</span>
              </div>
              <textarea
                id="push-body"
                className="ef-input ef-textarea"
                name="body"
                rows={3}
                value={values.body}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Коротко: что предлагаем и до какого числа. Длинный текст на телефоне обрежется."
                disabled={disabled}
              />
              {fieldError('body') && <div className="hint hint-warn ef-field-error">{fieldError('body')}</div>}
            </div>

            <div className="ef-field">
              <label htmlFor="push-url">Ссылка — куда ведёт пуш</label>
              <input
                id="push-url"
                className="ef-input mono"
                name="url"
                value={values.url}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="/sale/tyres или https://abkhaz-auto.ru/…"
                disabled={disabled}
              />
              <div className="hint">Путь витрины (откроется в приложении) или полная http(s)-ссылка.</div>
              {fieldError('url') && <div className="hint hint-warn ef-field-error">{fieldError('url')}</div>}
            </div>

            <div className="ef-field">
              <label>Иконка (необязательно)</label>
              <PromoImageUpload
                value={values.icon}
                onChange={(url) => setFieldValue('icon', url)}
                label="Иконка пуша"
                recommend="Квадрат 192×192 или больше, PNG/WebP. Без иконки покажется иконка приложения."
              />
              <FieldError name="icon" />
            </div>
          </section>

          <TargetingSection />
          <div className="hint">
            Фильтры сохраняются вместе с рассылкой; на первом этапе пуш уходит всем пользователям с включёнными уведомлениями.
          </div>
        </div>
      </div>

      <style>{EDITOR_CSS}</style>
    </Form>
  );
}
