'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EnvMode } from '@/lib/env-mode';
import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  campaignCanCancel,
  isoToTbilisiLocal,
  localDateTimeToIso,
  PushCommandRegistry,
  pushCommandKey,
  pushDraftInputSchema,
  runIdempotentPushCommand,
  withPushExpectedEnv,
  type PushAudienceMode,
  type PushCampaign,
  type PushCampaignListResponse,
  type PushCampaignStatus,
  type PushWorkerStatus,
} from '@/lib/push-campaigns';

class PushApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = 'PushApiError';
  }
}

interface DraftState {
  dedupKey: string;
  title: string;
  body: string;
  path: string;
  audienceMode: PushAudienceMode;
  consentBasis: string;
  maxRecipients: number;
  delivery: 'now' | 'scheduled';
  scheduledLocal: string;
}

const EMPTY_DRAFT: DraftState = {
  dedupKey: '',
  title: '',
  body: '',
  path: '/zapros',
  audienceMode: 'marketing_opt_in',
  consentBasis: '',
  maxRecipients: 20_000,
  delivery: 'now',
  scheduledLocal: '',
};

const STATUS_LABEL: Record<PushCampaignStatus, string> = {
  draft: 'Черновик',
  prepared: 'Аудитория рассчитана',
  scheduled: 'Запланирована',
  running: 'Отправляется',
  cancel_requested: 'Отмена…',
  completed: 'Завершена',
  completed_with_failures: 'Завершена с ошибками',
  cancelled: 'Отменена',
  failed: 'Ошибка',
};

function statusTone(status: PushCampaignStatus): string {
  if (status === 'completed') return 'success';
  if (status === 'running' || status === 'scheduled' || status === 'prepared') return 'active';
  if (status === 'failed' || status === 'completed_with_failures') return 'danger';
  return 'neutral';
}

function campaignDate(value: string | null): string {
  if (!value) return 'Сразу после подтверждения';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tbilisi',
  }).format(new Date(value));
}

function campaignMatchesDraft(
  campaign: PushCampaign,
  draft: DraftState,
  scheduledAt: string | null,
): boolean {
  return campaign.dedupKey === draft.dedupKey.trim()
    && campaign.title === draft.title.trim()
    && campaign.body === draft.body.trim()
    && campaign.path === draft.path.trim()
    && campaign.audienceMode === draft.audienceMode
    && (campaign.consentBasis ?? '') === (
      draft.audienceMode === 'offline_consent' ? draft.consentBasis.trim() : ''
    )
    && campaign.scheduledAt === scheduledAt
    && campaign.maxRecipients === draft.maxRecipients;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({ error: 'invalid_response' }));
  if (!response.ok) {
    const source = payload as { error?: string; message?: string };
    const friendly: Record<string, string> = {
      campaign_not_found: 'Кампания не найдена. Обновите журнал.',
      invalid_state: 'Статус кампании уже изменился. Обновите журнал и повторите действие.',
      confirmation_mismatch: 'Число подтверждения или снимок аудитории изменились. Рассчитайте аудиторию заново.',
      audience_too_large: 'Аудитория больше заданного жёсткого лимита.',
      bad_request: 'Проверьте параметры кампании.',
      conflict: 'Кампанию уже изменили в другой вкладке. Обновите журнал.',
      push_admin_unavailable: 'Сервис рассылок временно недоступен. Безопасно сверяем состояние…',
      worker_unavailable: 'Worker рассылок сейчас недоступен. Запуск не выполнен.',
      reauth_failed: 'Неверный пароль администратора.',
      bff_unreachable: 'Нет связи с сервисом рассылок.',
      environment_changed: 'Окружение изменилось в другой вкладке. Перезагружаем страницу…',
      env_not_configured: 'Рассылки в этом окружении ещё не настроены.',
      unauthorized: 'Сессия администратора истекла. Войдите заново.',
      forbidden: 'У этой учётной записи нет доступа к рассылкам.',
      bad_confirmation: 'Проверьте пароль и число подтверждения.',
      invalid_body: 'Проверьте заполнение полей кампании.',
      invalid_id: 'Некорректный идентификатор кампании. Обновите журнал.',
    };
    if (source.error === 'environment_changed' && typeof window !== 'undefined') {
      window.location.reload();
    }
    const code = source.error ?? `http_${response.status}`;
    throw new PushApiError(code, response.status, friendly[code] ?? source.message ?? code);
  }
  return payload as T;
}

function Progress({ campaign }: { campaign: PushCampaign }) {
  const total = campaign.eligibleUsers ?? 0;
  const done = campaign.accepted + campaign.skipped + campaign.failed
    + campaign.unknown + (campaign.cancelledCount ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      className="push-progress"
      role="progressbar"
      aria-label={`Обработано ${done} из ${total}`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(done, total)}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function PhonePreview({ title, body, path }: Pick<DraftState, 'title' | 'body' | 'path'>) {
  return (
    <div className="push-phone" aria-label="Предпросмотр push-уведомления">
      <div className="push-phone-top" aria-hidden>
        <span>9:41</span><span className="push-phone-island" /><span>5G&nbsp; ●</span>
      </div>
      <div className="push-notification">
        <div className="push-app-icon">AA</div>
        <div className="push-notification-copy">
          <div className="push-notification-app">АБХАЗ АВТО <span>сейчас</span></div>
          <strong>{title || 'Заголовок уведомления'}</strong>
          <p>{body || 'Текст, который увидит пользователь на экране телефона.'}</p>
        </div>
      </div>
      <div className="push-phone-route">Откроется: <code>{path || '/'}</code></div>
    </div>
  );
}

export function PushCampaignsPanel({ env }: { env: EnvMode }) {
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<PushCampaign | null>(null);
  const [campaigns, setCampaigns] = useState<PushCampaign[]>([]);
  const [worker, setWorker] = useState<PushWorkerStatus | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState<'load' | 'prepare' | 'queue' | 'cancel' | null>('load');
  const [error, setError] = useState<string | null>(null);
  const commandsRef = useRef(new PushCommandRegistry());
  const commands = commandsRef.current;

  const pushFetch = useCallback(
    (input: RequestInfo | URL, init: RequestInit = {}) =>
      fetch(input, withPushExpectedEnv(env, init)),
    [env],
  );

  const reload = useCallback(async (signal?: AbortSignal) => {
    const response = await pushFetch('/api/push/campaigns', { cache: 'no-store', signal });
    const data = await readJson<PushCampaignListResponse>(response);
    setCampaigns(data.campaigns);
    setWorker(data.worker);
    return data;
  }, [pushFetch]);

  async function executeMutation<T>(
    operation: 'upsert' | 'prepare' | 'queue' | 'cancel',
    url: string,
    payload: Record<string, unknown>,
    extraBody: Record<string, unknown> = {},
  ): Promise<T> {
    const key = pushCommandKey(operation, { url, ...payload });
    return runIdempotentPushCommand({
      registry: commands,
      key,
      request: async (commandId) => readJson<T>(await pushFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...payload, commandId, ...extraBody }),
        })),
      reconcile: () => reload(),
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить кампании');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(null);
      });
    return () => controller.abort();
  }, [reload]);

  const hasLiveCampaign = campaigns.some((campaign) =>
    ['scheduled', 'running', 'cancel_requested'].includes(campaign.status));

  useEffect(() => {
    if (!hasLiveCampaign) return;
    const timer = window.setInterval(() => {
      void reload().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasLiveCampaign, reload]);

  const update = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setPrepared(null);
    setConfirmation('');
    setError(null);
  };

  const rememberCampaign = (campaign: PushCampaign) => {
    setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
  };

  const scheduledAt = useMemo(
    () => draft.delivery === 'scheduled' ? localDateTimeToIso(draft.scheduledLocal) : null,
    [draft.delivery, draft.scheduledLocal],
  );

  async function prepareAudience() {
    setError(null);
    const draftPayload = {
      id: draftId ?? undefined,
      dedupKey: draft.dedupKey,
      title: draft.title,
      body: draft.body,
      path: draft.path,
      audienceMode: draft.audienceMode,
      consentBasis: draft.audienceMode === 'offline_consent' ? draft.consentBasis : undefined,
      scheduledAt,
      maxRecipients: draft.maxRecipients,
      expectedRevision: draftId ? draftRevision ?? undefined : undefined,
    };
    const parsed = pushDraftInputSchema.safeParse({
      ...draftPayload,
      commandId: '00000000-0000-4000-8000-000000000000',
    });
    if (!parsed.success || (draft.delivery === 'scheduled' && !scheduledAt)) {
      setError(parsed.success ? 'Укажите корректные дату и время отправки' : parsed.error.issues[0]?.message ?? 'Проверьте поля');
      return;
    }

    setBusy('prepare');
    try {
      const validatedDraft: Record<string, unknown> = { ...parsed.data };
      delete validatedDraft.commandId;
      const saved = await executeMutation<{ campaign: PushCampaign }>(
        'upsert',
        '/api/push/campaigns',
        validatedDraft,
      );
      rememberCampaign(saved.campaign);
      setDraftId(saved.campaign.id);
      setDraftRevision(saved.campaign.revision);
      const result = await executeMutation<{ campaign: PushCampaign }>(
        'prepare',
        `/api/push/campaigns/${saved.campaign.id}/prepare`,
        { expectedRevision: saved.campaign.revision },
      );
      rememberCampaign(result.campaign);
      setPrepared(result.campaign);
      setDraftRevision(result.campaign.revision);
      setConfirmation('');
      await reload().catch(() => {
        setError('Аудитория рассчитана, но журнал пока не обновился. Данные кампании сохранены.');
      });
    } catch (reason) {
      const snapshot = await reload().catch(() => null);
      const reconciled = snapshot?.campaigns.find((campaign) =>
        campaignMatchesDraft(campaign, draft, scheduledAt));
      if (reconciled) {
        setDraftId(reconciled.id);
        setDraftRevision(reconciled.revision);
        if (reconciled.status !== 'draft') {
          setPrepared(reconciled);
          setConfirmation('');
          setError(null);
          return;
        }
      }
      setError(reason instanceof Error ? reason.message : 'Не удалось рассчитать аудиторию');
    } finally {
      setBusy(null);
    }
  }

  async function queueCampaign() {
    if (!prepared?.eligibleUsers || !prepared.audienceDigest || !prepared.payloadHash) return;
    setBusy('queue');
    setError(null);
    try {
      const payload = {
        expectedEligibleUsers: prepared.eligibleUsers,
        expectedRevision: prepared.revision,
        maxRecipients: prepared.maxRecipients,
        expectedAudienceDigest: prepared.audienceDigest,
        expectedPayloadHash: prepared.payloadHash,
        confirmation,
      };
      const result = await executeMutation<{ campaign: PushCampaign }>(
        'queue',
        `/api/push/campaigns/${prepared.id}/queue`,
        payload,
        { password: adminPassword },
      );
      rememberCampaign(result.campaign);
      setPrepared(result.campaign);
      setDraftRevision(result.campaign.revision);
      setConfirmation('');
      setAdminPassword('');
      await reload().catch(() => {
        setError('Рассылка запущена, но журнал пока не обновился. Повторно запускать её не нужно.');
      });
    } catch (reason) {
      const snapshot = await reload().catch(() => null);
      const reconciled = snapshot?.campaigns.find((campaign) => campaign.id === prepared.id);
      if (reconciled && reconciled.status !== 'prepared') {
        setPrepared(reconciled);
        setDraftRevision(reconciled.revision);
        setConfirmation('');
        setAdminPassword('');
        setError(null);
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Не удалось поставить рассылку в очередь');
    } finally {
      setBusy(null);
    }
  }

  async function cancelCampaign(id: string) {
    setBusy('cancel');
    setError(null);
    try {
      const campaign = campaigns.find((item) => item.id === id);
      if (!campaign) throw new Error('Кампания не найдена в текущем журнале');
      const result = await executeMutation<{ campaign: PushCampaign }>(
        'cancel',
        `/api/push/campaigns/${id}/cancel`,
        { expectedRevision: campaign.revision },
      );
      rememberCampaign(result.campaign);
      if (prepared?.id === id) {
        setPrepared(null);
        setDraftRevision(result.campaign.revision);
        setConfirmation('');
        setAdminPassword('');
      }
      await reload().catch(() => {
        setError('Отмена принята, но журнал пока не обновился. Повторять действие не нужно.');
      });
    } catch (reason) {
      const snapshot = await reload().catch(() => null);
      const reconciled = snapshot?.campaigns.find((campaign) => campaign.id === id);
      if (reconciled && ['cancel_requested', 'cancelled'].includes(reconciled.status)) {
        rememberCampaign(reconciled);
        if (prepared?.id === id) {
          setPrepared(null);
          setDraftRevision(reconciled.revision);
          setConfirmation('');
          setAdminPassword('');
        }
        setError(null);
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Не удалось отменить рассылку');
    } finally {
      setBusy(null);
    }
  }

  function openCampaign(campaign: PushCampaign) {
    const local = campaign.scheduledAt ? isoToTbilisiLocal(campaign.scheduledAt) : '';
    setDraftId(campaign.id);
    setDraftRevision(campaign.revision);
    setDraft({
      dedupKey: campaign.dedupKey,
      title: campaign.title,
      body: campaign.body,
      path: campaign.path,
      audienceMode: campaign.audienceMode,
      consentBasis: campaign.consentBasis ?? '',
      maxRecipients: campaign.maxRecipients,
      delivery: campaign.scheduledAt ? 'scheduled' : 'now',
      scheduledLocal: local,
    });
    setPrepared(campaign.status === 'prepared' ? campaign : null);
    setConfirmation('');
    setAdminPassword('');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const canConfirm = prepared?.eligibleUsers != null
    && confirmation === String(prepared.eligibleUsers)
    && adminPassword.length > 0
    && worker?.enabled === true
    && worker.healthy === true;

  return (
    <div className="push-page">
      <div className="page-header push-page-header">
        <div className="left">
          <div className="eyebrow">КАНАЛ · MOBILE PUSH</div>
          <h1>
            <span className="push-page-title-copy">Push‑рассылки</span>
            <span className="count-chip">{campaigns.length}</span>
            <span className={`push-env-chip push-env-${env}`}>{env === 'prod' ? 'ПРОД' : 'ТЕСТ'}</span>
          </h1>
        </div>
        <div className={`push-worker ${worker === null ? 'is-pending' : worker.healthy ? 'is-healthy' : 'is-offline'}`} role="status">
          <span aria-hidden />
          {worker === null ? 'Проверяем worker…' : worker.healthy ? 'Worker готов' : worker.enabled === false ? 'Worker выключен' : 'Нет связи с worker'}
        </div>
      </div>

      <div className="push-compose-grid">
        <aside className="push-preview-column">
          <div className="push-step">ПРЕДПРОСМОТР</div>
          <PhonePreview title={draft.title} body={draft.body} path={draft.path} />
          <div className="push-safety-card">
            <strong>Одна кампания — один push пользователю</strong>
            <p>Получатели фиксируются в базе до запуска. Повторный ключ, явный отказ, бан или удалённый аккаунт блокируют отправку.</p>
          </div>
        </aside>

        <section className="form-panel push-compose" aria-labelledby="push-compose-title">
          <div className="panel-head push-panel-head">
            <div>
              <div className="push-step">01 · СООБЩЕНИЕ</div>
              <h2 id="push-compose-title">Новая рассылка</h2>
            </div>
            {draftId && <button type="button" className="btn btn-ghost" onClick={() => { setDraft(EMPTY_DRAFT); setDraftId(null); setDraftRevision(null); setPrepared(null); setAdminPassword(''); }}>Новый черновик</button>}
          </div>
          <div className="panel-body">
            <div className="field">
              <label htmlFor="push-dedup">Ключ кампании</label>
              <input id="push-dedup" className="input mono-input" value={draft.dedupKey} onChange={(event) => update('dedupKey', event.target.value)} placeholder="parts-rfq-september" autoComplete="off" />
              <div className="hint">Уникальный ключ не даст отправить эту кампанию повторно.</div>
            </div>
            <div className="field">
              <label htmlFor="push-title">Заголовок <span>{draft.title.length}/{PUSH_TITLE_MAX}</span></label>
              <input id="push-title" className="input" value={draft.title} maxLength={PUSH_TITLE_MAX} onChange={(event) => update('title', event.target.value)} placeholder="Найдём запчасть за вас" />
            </div>
            <div className="field">
              <label htmlFor="push-body">Текст <span>{draft.body.length}/{PUSH_BODY_MAX}</span></label>
              <textarea id="push-body" rows={4} value={draft.body} maxLength={PUSH_BODY_MAX} onChange={(event) => update('body', event.target.value)} placeholder="Опишите деталь один раз — магазины сами пришлют цены." />
            </div>
            <div className="field">
              <label htmlFor="push-path">Куда ведёт</label>
              <input id="push-path" className="input mono-input" value={draft.path} onChange={(event) => update('path', event.target.value)} placeholder="/zapros" />
            </div>

            <fieldset className="push-choice-group">
              <legend>Аудитория</legend>
              <label className={`push-choice${draft.audienceMode === 'marketing_opt_in' ? ' is-selected' : ''}`}>
                <input type="radio" name="audience" checked={draft.audienceMode === 'marketing_opt_in'} onChange={() => update('audienceMode', 'marketing_opt_in')} />
                <span><strong>Согласие в приложении</strong><small>Только пользователи с включёнными маркетинговыми уведомлениями</small></span>
              </label>
              <label className={`push-choice push-choice-warning${draft.audienceMode === 'offline_consent' ? ' is-selected' : ''}`}>
                <input type="radio" name="audience" checked={draft.audienceMode === 'offline_consent'} onChange={() => update('audienceMode', 'offline_consent')} />
                <span><strong>Учесть офлайн‑согласие</strong><small>Добавляет пользователей без настройки, но никогда — явно отказавшихся</small></span>
              </label>
            </fieldset>

            {draft.audienceMode === 'offline_consent' && (
              <div className="field">
                <label htmlFor="push-consent">Основание согласия</label>
                <textarea id="push-consent" rows={2} value={draft.consentBasis} onChange={(event) => update('consentBasis', event.target.value)} placeholder="Например: письменное согласие в офисе, форма v2 от 01.09.2026" />
              </div>
            )}

            <div className="field">
              <label htmlFor="push-limit">Жёсткий лимит получателей</label>
              <input
                id="push-limit"
                className="input mono-input"
                type="number"
                min={1}
                max={500000}
                value={draft.maxRecipients}
                onChange={(event) => update('maxRecipients', Number(event.target.value))}
              />
              <div className="hint">Если аудитория окажется больше, сервер не запустит кампанию.</div>
            </div>

            <fieldset className="push-choice-group push-delivery">
              <legend>Когда отправить</legend>
              <label className={`push-choice${draft.delivery === 'now' ? ' is-selected' : ''}`}>
                <input type="radio" name="delivery" checked={draft.delivery === 'now'} onChange={() => update('delivery', 'now')} />
                <span><strong>Сразу</strong><small>Начнётся после финального подтверждения</small></span>
              </label>
              <label className={`push-choice${draft.delivery === 'scheduled' ? ' is-selected' : ''}`}>
                <input type="radio" name="delivery" checked={draft.delivery === 'scheduled'} onChange={() => update('delivery', 'scheduled')} />
                <span><strong>По расписанию</strong><small>Часовой пояс — Тбилиси</small></span>
              </label>
            </fieldset>
            {draft.delivery === 'scheduled' && (
              <div className="field">
                <label htmlFor="push-schedule">Дата и время</label>
                <input id="push-schedule" className="input" type="datetime-local" value={draft.scheduledLocal} onChange={(event) => update('scheduledLocal', event.target.value)} />
              </div>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null} onClick={prepareAudience}>
              {busy === 'prepare' ? 'Считаем…' : 'Рассчитать аудиторию'}
            </button>
            <span className="push-safe-note">Отправка на этом шаге не начнётся</span>
          </div>
        </section>
      </div>

      {error && <div className="push-error" role="alert">{error}</div>}

      {prepared && prepared.status === 'prepared' && (
        <section className="form-panel push-confirm" aria-labelledby="push-confirm-title">
          <div className="push-confirm-count">
            <span className="push-step">02 · ЗАФИКСИРОВАННАЯ АУДИТОРИЯ</span>
            <strong>{prepared.eligibleUsers?.toLocaleString('ru-RU') ?? '—'}</strong>
            <span>пользователей · {prepared.candidateTokens?.toLocaleString('ru-RU') ?? '—'} мобильных токенов</span>
          </div>
          <div className="push-confirm-copy">
            <h2 id="push-confirm-title">Проверьте число перед запуском</h2>
            <p>Введите <strong>{prepared.eligibleUsers}</strong>. Состав аудитории и текст защищены контрольными хешами; при изменении потребуется новый расчёт.</p>
            <div className="push-audience-breakdown">
              <span>Явный отказ: <strong>{prepared.exclusions?.explicitOptOut ?? 0}</strong></span>
              <span>Заблокированы: <strong>{prepared.exclusions?.banned ?? 0}</strong></span>
              <span>Удалены: <strong>{prepared.exclusions?.deleted ?? 0}</strong></span>
              <span>Без mobile‑токена: <strong>{prepared.exclusions?.noMobileToken ?? 0}</strong></span>
            </div>
            <div className="push-digest">Снимок аудитории <code>{prepared.audienceDigest?.slice(0, 12)}…</code></div>
            <div className="push-confirm-action">
              <input className="input mono-input" inputMode="numeric" aria-label="Подтверждение числа получателей" value={confirmation} onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ''))} placeholder={String(prepared.eligibleUsers ?? '')} />
              <input className="input" type="password" autoComplete="current-password" aria-label="Пароль администратора" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="Пароль администратора" />
              <button type="button" className="btn btn-primary btn-lg" disabled={!canConfirm || busy !== null} onClick={queueCampaign}>
                {busy === 'queue' ? 'Ставим в очередь…' : prepared.scheduledAt ? `Запланировать на ${campaignDate(prepared.scheduledAt)}` : 'Отправить сейчас'}
              </button>
            </div>
            {worker?.healthy !== true && <p className="push-worker-warning">Запуск недоступен: worker не подтвердил готовность.</p>}
          </div>
        </section>
      )}

      <section className="push-history" aria-labelledby="push-history-title">
        <div className="push-history-head">
          <div>
            <div className="push-step">03 · ЖУРНАЛ</div>
            <h2 id="push-history-title">История кампаний</h2>
          </div>
          <button type="button" className="btn btn-secondary" disabled={busy === 'load'} onClick={() => void reload().catch(() => setError('Не удалось обновить список'))}>Обновить</button>
        </div>
        {busy === 'load' && campaigns.length === 0 ? (
          <div className="empty">Загружаем кампании…</div>
        ) : campaigns.length === 0 ? (
          <div className="empty">Рассылок пока нет. Первая появится здесь после расчёта аудитории.</div>
        ) : (
          <div className="push-campaign-list">
            {campaigns.map((campaign) => (
              <article className="push-campaign-row" key={campaign.id}>
                <div className="push-campaign-main">
                  <div className="push-campaign-title-row">
                    <strong>{campaign.title}</strong>
                    <span className={`push-status push-status-${statusTone(campaign.status)}`}>{STATUS_LABEL[campaign.status]}</span>
                  </div>
                  <p>{campaign.body}</p>
                  <div className="push-campaign-meta"><code>{campaign.dedupKey}</code><span>→ {campaign.path}</span><span>{campaignDate(campaign.scheduledAt)}</span></div>
                  {['running', 'cancel_requested'].includes(campaign.status) && <Progress campaign={campaign} />}
                </div>
                <dl className="push-result-grid">
                  <div><dt>Аудитория</dt><dd>{campaign.eligibleUsers?.toLocaleString('ru-RU') ?? '—'}</dd></div>
                  <div><dt>Принято FCM</dt><dd>{campaign.accepted.toLocaleString('ru-RU')}</dd></div>
                  <div><dt>Пропущено</dt><dd>{campaign.skipped.toLocaleString('ru-RU')}</dd></div>
                  <div><dt>Ошибки / unknown</dt><dd>{campaign.failed + campaign.unknown}</dd></div>
                </dl>
                <div className="push-row-actions">
                  {['draft', 'prepared'].includes(campaign.status) && <button type="button" className="btn btn-secondary" onClick={() => openCampaign(campaign)}>Открыть</button>}
                  {campaignCanCancel(campaign.status) && campaign.status !== 'cancel_requested' && (
                    <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void cancelCampaign(campaign.id)}>
                      {['draft', 'prepared'].includes(campaign.status) ? 'Отменить черновик' : 'Остановить'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
