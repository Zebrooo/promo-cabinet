'use client';
// Список пуш-рассылок. Данные живут за BFF (S3 push-campaigns.json), поэтому
// как и RecentCampaignsList — без серверного pre-fetch, грузится при
// монтировании; «Отправить» и «Удалить» дёргают /api/push-campaigns/*.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';
import type { PushCampaign } from '@/lib/push-campaign-schema';
import { describePushError, formatPushWhen, formatSendResult, PUSH_STATUS_LABEL, pushTargetingSummary } from '@/lib/push-campaign-summary';
import { safeHttpUrl } from '@/components/RecentCampaignsList';

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; campaigns: PushCampaign[]; broadcastConfigured: boolean };

function CampaignCard({
  c, broadcastConfigured, busy, onSend, onDelete,
}: {
  c: PushCampaign;
  broadcastConfigured: boolean;
  busy: boolean;
  onSend: () => void;
  onDelete: () => void;
}) {
  const targeting = pushTargetingSummary(c);
  const icon = safeHttpUrl(c.icon);
  const draft = c.status === 'draft';
  return (
    <article className={`cmp-card push-card${draft ? '' : ' is-sent'}`} data-push-campaign-id={c.id}>
      <div className="push-card-row">
        {icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="push-icon" src={icon} alt="" loading="lazy" referrerPolicy="no-referrer" />
        )}
        <div className="cmp-main">
          <div className="cmp-title">
            <span>{c.title}</span>
            <span className={`badge ${draft ? 'badge-inactive' : 'badge-active'}`}>{PUSH_STATUS_LABEL[c.status]}</span>
            <span className="aa-key">{c.id}</span>
          </div>
          <div className="push-body">{c.body}</div>
          <div className="cmp-meta">
            <span className="mono">→ {c.url}</span>
            <span>изменено {formatPushWhen(c.updatedAt)}</span>
            {c.status === 'sent' && <span className="cmp-sent">отправлено {formatPushWhen(c.sentAt)} · {formatSendResult(c.sendResult)}</span>}
            {draft && c.lastSendError && <span className="tone-warn">не отправилось: {c.lastSendError}</span>}
          </div>
          <div className="cmp-meta">
            {targeting.length === 0
              ? <span>Таргетинг: все пользователи</span>
              : targeting.map((t) => <span key={t}>{t}</span>)}
          </div>
        </div>
        <div className="push-actions">
          <Link href={`/cabinet/push/${encodeURIComponent(c.id)}`} className="btn btn-secondary btn-sm">
            {draft ? 'Редактировать' : 'Открыть'}
          </Link>
          {draft && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !broadcastConfigured}
              title={broadcastConfigured ? undefined : 'У BFF не настроена отправка (AA_BASE_URL / PROMO_TICKET_PRIVATE_KEY)'}
              onClick={onSend}
              data-track="push_campaign_send"
              data-track-id={c.id}
            >
              {busy ? 'Отправляю…' : 'Отправить пуш'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onDelete} data-track="push_campaign_delete" data-track-id={c.id}>
            Удалить
          </button>
        </div>
      </div>
    </article>
  );
}

export function PushCampaignsList() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState('');

  const refresh = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch('/api/push-campaigns', { cache: 'no-store' });
    } catch {
      setLoad({ kind: 'error', message: 'Сеть недоступна — проверьте соединение.' });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { campaigns?: PushCampaign[]; broadcastConfigured?: boolean; error?: string };
    if (!res.ok) {
      setLoad({ kind: 'error', message: describePushError(res.status, data) });
      return;
    }
    setLoad({ kind: 'ready', campaigns: data.campaigns ?? [], broadcastConfigured: data.broadcastConfigured === true });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function send(c: PushCampaign) {
    const ok = confirm(
      `Отправить пуш «${c.title}» всем пользователям с включёнными уведомлениями?\n\n` +
      'Фильтры таргетинга пока сохраняются, но на получателей не влияют. Отменить рассылку после отправки нельзя.',
    );
    if (!ok) return;
    setFlash('');
    setBusyId(c.id);
    let res: Response;
    try {
      res = await fetch(`/api/push-campaigns/${encodeURIComponent(c.id)}/send`, { method: 'POST' });
    } catch {
      setBusyId(null);
      setFlash('Сеть недоступна — не удалось узнать, ушла ли рассылка. Обновите список перед повтором.');
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { campaign?: PushCampaign; error?: string; reason?: string };
    setBusyId(null);
    if (!res.ok || !data.campaign) {
      trackEvent('push_campaign_send_failed', { push_campaign_id: c.id, reason: (data.error ?? String(res.status)).slice(0, 120) });
      setFlash(describePushError(res.status, data));
    } else {
      trackEvent('push_campaign_send_success', { push_campaign_id: c.id, users: data.campaign.sendResult?.users ?? 0 });
      setFlash(`Рассылка «${c.title}» отправлена: ${formatSendResult(data.campaign.sendResult)}.`);
    }
    await refresh();
  }

  async function remove(c: PushCampaign) {
    if (!confirm(`Удалить ${c.status === 'draft' ? 'черновик' : 'отправленную рассылку'} «${c.title}»?`)) return;
    setFlash('');
    setBusyId(c.id);
    let res: Response;
    try {
      res = await fetch(`/api/push-campaigns/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
    } catch {
      setBusyId(null);
      setFlash('Сеть недоступна — проверьте соединение.');
      return;
    }
    setBusyId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setFlash(describePushError(res.status, data));
    } else {
      trackEvent('push_campaign_delete_success', { push_campaign_id: c.id });
    }
    await refresh();
  }

  if (load.kind === 'loading') return <div className="empty">Загружаю рассылки…</div>;
  if (load.kind === 'error') {
    return (
      <div className="empty">
        {load.message}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLoad({ kind: 'loading' }); void refresh(); }}>Повторить</button>
      </div>
    );
  }

  const { campaigns, broadcastConfigured } = load;
  const drafts = campaigns.filter((c) => c.status === 'draft');
  const sent = campaigns.filter((c) => c.status === 'sent');

  return (
    <div>
      {!broadcastConfigured && (
        <div className="leads-warn">
          У BFF не заданы AA_BASE_URL / PROMO_TICKET_PRIVATE_KEY — черновики сохраняются, но отправить рассылку пока нельзя.
        </div>
      )}
      {flash && <div className="cmp-flash">{flash}</div>}
      {campaigns.length === 0 && (
        <div className="empty">Рассылок ещё нет — создайте первую кнопкой «Новая рассылка».</div>
      )}
      {drafts.length > 0 && (
        <section className="aa-section">
          <div className="aa-section-title">Черновики <span className="count-chip">{drafts.length}</span></div>
          <div className="cmp-list">
            {drafts.map((c) => (
              <CampaignCard key={c.id} c={c} broadcastConfigured={broadcastConfigured} busy={busyId === c.id} onSend={() => send(c)} onDelete={() => remove(c)} />
            ))}
          </div>
        </section>
      )}
      {sent.length > 0 && (
        <section className="aa-section">
          <div className="aa-section-title">Отправленные <span className="count-chip">{sent.length}</span></div>
          <div className="cmp-list">
            {sent.map((c) => (
              <CampaignCard key={c.id} c={c} broadcastConfigured={broadcastConfigured} busy={busyId === c.id} onSend={() => send(c)} onDelete={() => remove(c)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
