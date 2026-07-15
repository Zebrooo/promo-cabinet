'use client';
// Promo editor — Figma "03 · Promo editor" port. Formik-based rewrite of the
// pre-refactor 1853-line useState monolith; layout/CSS unchanged, see
// editor-styles.ts for the extracted stylesheet and PR-2's ТЗ for the file
// map (sections/, content/, fields.tsx, validate.ts, to-persisted.ts).
//
// Layout:
//   ┌─ sticky page-bar ───────────────────────────────────────┐
//   │ ← Вернуться к списку     [Удалить промо] [Сохранить]    │
//   ├─────────────────────────────────────────────────────────┤
//   │ H1 «Редактирование промо»                                │
//   │ mono caption «ID xxx · обновлено HH:MM»                  │
//   │                                                          │
//   │ ┌─ main editor column ────────┬─ live preview rail ─┐    │
//   │ │ ГДЕ ПОКАЗЫВАТЬ / ТИП ПРОМО  │ ЖИВОЙ ПРЕВЬЮ        │    │
//   │ │ Content (per format)        │ Desktop · Tablet · M │    │
//   │ │ ОЧЕРЕДИ ПОКАЗА               │                       │    │
//   │ │ ЦЕПОЧКА ПОКАЗОВ              │                       │    │
//   │ │ Расширенные настройки ▾     │                       │    │
//   │ └─────────────────────────────┴───────────────────────┘    │
//   └─────────────────────────────────────────────────────────┘
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Formik, Form, useFormikContext, setNestedObjectValues } from 'formik';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';
import type { Promo } from '@/lib/schema';
import { AiEnhanceButton } from '@/components/AiEnhanceButton';
import { EnhanceDiff, type EnhancePatch } from '@/components/EnhanceDiff';
import type { AiSuggestions } from '@/lib/ai-client';
import { validatePromoForm } from './validate';
import { toPersisted, toPreview } from './to-persisted';
import { EDITOR_CSS } from './editor-styles';
import { DevicePlacementSection } from './sections/DevicePlacementSection';
import { ContentSection } from './sections/ContentSection';
import { ScheduleSection } from './sections/ScheduleSection';
import { TargetingSection } from './sections/TargetingSection';
import { FrequencySection, FrequencyCapFields } from './sections/FrequencySection';
import { QueuesSection } from './sections/QueuesSection';
import { PreviewRail } from './PreviewRail';

const empty: Promo = {
  id: '', name: '', startsAt: '', endsAt: '', targeting: {},
  cooldownHours: 0, format: 'inline', title: '',
  audience: 'all',
  deviceTarget: 'both',
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_promo:        'Проверьте поля: ID, название и заголовок обязательны, а начало показа должно быть раньше окончания.',
  duplicate_id:         'Промо с таким ID уже существует — выберите другой ID.',
  id_mismatch:          'ID промо не совпадает.',
  not_found:            'Промо не найдено.',
  unauthorized:         'Сессия истекла. Войдите снова.',
  catalogue_unavailable:'Хранилище недоступно (S3). Попробуйте ещё раз.',
};

type Props = {
  initial?: Promo;
  mode: 'create' | 'edit';
  /** All available queues (for the queue-membership chip row). */
  queueNames?: string[];
  /** Names of the queues this promo is currently in. Server-fetched. */
  membership?: string[];
  /** Every promo in the pool (id + title) — feeds the chain <datalist>. */
  poolPromos?: { id: string; title: string }[];
};

export function PromoForm({
  initial, mode, queueNames = [], membership = [], poolPromos = [],
}: Props) {
  return (
    <Formik<Promo>
      initialValues={initial ?? empty}
      validate={validatePromoForm}
      onSubmit={() => { /* handled by FormBody's own submit — see below */ }}
    >
      <FormBody
        mode={mode}
        queueNames={queueNames}
        membership={membership}
        poolPromos={poolPromos}
      />
    </Formik>
  );
}

/** Everything that needs useFormikContext lives inside the <Formik> tree —
 *  split out so PromoForm itself stays a thin provider wrapper. */
function FormBody({
  mode, queueNames, membership, poolPromos,
}: {
  mode: 'create' | 'edit';
  queueNames: string[];
  membership: string[];
  poolPromos: { id: string; title: string }[];
}) {
  const router = useRouter();
  const { values, setFieldValue, setTouched, validateForm } = useFormikContext<Promo>();

  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiResult, setAiResult] = useState<{ suggestions: AiSuggestions; cacheHit: boolean; model: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function applyEnhancePatch(patch: EnhancePatch) {
    if (patch.title !== undefined) setFieldValue('title', patch.title);
    if (patch.description !== undefined) setFieldValue('description', patch.description);
    if (patch.actionLabel !== undefined) {
      setFieldValue(
        'action',
        values.action?.href ? { href: values.action.href, label: patch.actionLabel } : values.action,
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const formErrors = await validateForm();
    if (Object.keys(formErrors).length > 0) {
      // Touch everything so field-level errors render (mirrors submit-time
      // err-banner + touched behaviour from the ТЗ). setNestedObjectValues
      // (not a flat Object.keys map) is required so nested paths like
      // targeting.minAge / action.href / steps.0.title get touched too —
      // a flat map only touches the top-level key, leaving getIn(touched, ...)
      // undefined for nested FieldError checks.
      setTouched(setNestedObjectValues(formErrors, true), false);
      setError('Проверьте поля формы — есть ошибки.');
      return;
    }

    // Если divkit и есть inline JSON — улетаем им в S3, получаем URL,
    // только потом сохраняем промо. Это ровно тот flow что договаривались:
    // S3 пишется только при «Сохранить промо», иначе кабинет держит JSON
    // в state и показывает в preview.
    let draft: Promo = values;
    if (values.format === 'divkit' && values.divkitJson && !values.divkitUrl) {
      setSaving(true);
      try {
        const r = await fetch('/api/upload-divkit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ json: values.divkitJson, promoId: values.id }),
        });
        const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!r.ok || !j.url) {
          setSaving(false);
          setError(`Не удалось залить DivKit JSON в S3: ${j.error ?? r.status}`);
          return;
        }
        // divkitJson обнуляется явно ЗДЕСЬ, после успешного аплоада — ФИКС
        // бага старого sanitize(), где divkitJson мог утечь в пул, если
        // caller забывал его вычистить. toPersisted() дополнительно
        // укрепляет тот же инвариант.
        draft = { ...values, divkitUrl: j.url, divkitJson: undefined };
      } catch {
        setSaving(false);
        setError('Сеть недоступна — DivKit JSON не залит в S3.');
        return;
      }
    }

    setSaving(true);
    let body: Promo;
    try {
      body = toPersisted(draft);
    } catch {
      setSaving(false);
      setError('Проверьте поля формы — есть ошибки.');
      return;
    }
    const url    = mode === 'create' ? '/api/promos' : `/api/promos/${encodeURIComponent(values.id)}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    let res: Response;
    try {
      res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      setSaving(false);
      setError('Сеть недоступна — проверьте соединение и повторите.');
      return;
    }
    if (res.ok) {
      trackEvent('promo_save_success', { promo_id: values.id, format: values.format });
      // referral-invite is a config-only custom promo: nothing renders on the
      // site, but its fields must additionally land in abkhaz-Supabase
      // referral_config (id=1), which only promo-bff can reach. Fire this
      // AFTER the S3 save succeeds and don't await it — best-effort mirror, a
      // BFF hiccup must never stop the admin from saving/queueing the promo
      // (see /api/referral-config/sync route doc).
      if (body.format === 'custom' && body.variant === 'referral-invite') {
        void fetch('/api/referral-config/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            active: body.referralActive ?? false,
            inviterCreditKopecks: body.referralInviterCreditKopecks ?? 0,
            sellerBonusKopecks: body.referralSellerBonusKopecks ?? 0,
            dailyInviteCap: body.referralDailyInviteCap ?? 1,
            holdHours: body.referralHoldHours ?? 0,
          }),
        }).catch(() => {});
      }
      router.push('/cabinet'); router.refresh(); return;
    }
    setSaving(false);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const errKey = data.error ?? '';
    trackEvent('promo_save_failed', { reason: errKey.slice(0, 120) });
    setError(ERROR_MESSAGES[errKey] ?? `Не удалось сохранить (ошибка ${res.status}).`);
  }

  /** DELETE /api/promos/[id] — the handler also removes the id from every
   *  queue, so no separate queue cleanup is needed here. */
  async function deletePromo() {
    if (mode !== 'edit' || !values.id) return;
    if (!confirm(`Удалить промо «${values.title || values.id}»? Оно будет убрано из всех очередей.`)) return;
    setError('');
    setDeleting(true);
    let res: Response;
    try {
      res = await fetch(`/api/promos/${encodeURIComponent(values.id)}`, { method: 'DELETE' });
    } catch {
      setDeleting(false);
      setError('Сеть недоступна — проверьте соединение и повторите.');
      return;
    }
    if (res.ok) {
      trackEvent('promo_delete_success', { promo_id: values.id, format: values.format });
      router.push('/cabinet'); router.refresh(); return;
    }
    setDeleting(false);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(ERROR_MESSAGES[data.error ?? ''] ?? `Не удалось удалить (ошибка ${res.status}).`);
  }

  const updatedNow = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // Preview rail wants a fully-stripped Promo; toPreview() is the lenient
  // (never-throwing, no zod validation) sibling of toPersisted() — it keeps
  // the preview format-clean even while the draft is mid-edit/invalid,
  // instead of falling back to raw cross-format values.
  const previewPromo: Promo = toPreview(values);

  return (
    <Form className="editor" onSubmit={submit}>
      {/* ── Sticky action bar ──────────────────────────────────── */}
      <div className="editor-bar">
        <Link href="/cabinet" className="editor-back">← Вернуться к списку</Link>
        <div className="editor-actions">
          {mode === 'edit' && (
            <button
              type="button"
              className="ebtn ebtn-danger"
              disabled={saving || deleting}
              onClick={deletePromo}
              data-track="promo_delete"
              data-track-id={values.id}
            >
              {deleting ? 'Удаляю…' : 'Удалить промо'}
            </button>
          )}
          <AiEnhanceButton
            getDraft={() => ({ title: values.title, description: values.description, action: values.action })}
            onSuggestions={setAiResult}
          />
          {/* Черновиков нет: каждый save уходит в S3 и попадает в прод в
              пределах 15-секундного TTL BFF-кэша — поэтому одна честная
              кнопка вместо пары «черновик/опубликовать». */}
          <button
            type="submit"
            className="ebtn ebtn-primary"
            disabled={saving || deleting}
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* ── Page heading ───────────────────────────────────────── */}
      <header className="editor-head">
        <h1>{mode === 'create' ? 'Новое промо' : 'Редактирование промо'}</h1>
        <div className="editor-meta mono">
          {mode === 'edit'
            ? `ID ${values.id} · обновлено ${updatedNow}`
            : 'Заполните поля и сохраните'}
        </div>
      </header>

      {aiResult && (
        <div className="editor-ai">
          <EnhanceDiff
            current={{ title: values.title, description: values.description, action: values.action }}
            suggestions={aiResult.suggestions}
            cacheHit={aiResult.cacheHit}
            model={aiResult.model}
            onAccept={applyEnhancePatch}
            onClose={() => setAiResult(null)}
          />
        </div>
      )}

      {/* ── Main editor + preview rail ─────────────────────────── */}
      <div className="editor-grid">
        <div className="editor-main">
          <DevicePlacementSection mode={mode} />
          <ContentSection />

          <QueuesSection
            mode={mode}
            promoId={values.id}
            queueNames={queueNames}
            membership={membership}
          />

          <FrequencySection poolPromos={poolPromos} />

          {/* Advanced disclosure */}
          <section className="ef-advanced">
            <button
              type="button"
              className="ef-advanced-toggle"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
            >
              <span>Расширенные настройки</span>
              <span className="ef-advanced-chev" aria-hidden>{advancedOpen ? '▴' : '▾'}</span>
            </button>

            {advancedOpen && (
              <div className="ef-advanced-body">
                <ScheduleSection mode={mode} />
                <FrequencyCapFields />
                <TargetingSection />
              </div>
            )}
          </section>

          {error && <div className="ef-error">{error}</div>}
        </div>

        <PreviewRail promo={previewPromo} />
      </div>

      <style>{EDITOR_CSS}</style>
    </Form>
  );
}
