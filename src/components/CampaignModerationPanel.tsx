'use client';
// Пульт модерации рекламных кампаний рекламодателей. Кампании создаёт
// витрина (ЛК «Реклама») в своей Supabase; promo-bff заводит каждую новую в
// очередь на подтверждение и шлёт админам пуш; в аукцион кампания попадает
// только после «Подтвердить». Данные — за BFF, поэтому, как и в
// AbkhazAutoPanel, серверного pre-fetch нет: всё грузится при монтировании.
import { useCallback, useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import type { CampaignModerationListing, ModeratedCampaign } from '@/lib/bff-client';

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; listing: CampaignModerationListing };

function describeError(status: number, error?: string): string {
  if (status === 503 && error === 'moderation_not_configured') return 'Модерация не настроена в BFF: нет Supabase витрины (AA_SUPABASE_URL/KEY).';
  if (status === 502 && error === 'bff_unreachable') return 'BFF недоступен — попробуйте позже.';
  if (status === 502) return 'BFF не смог прочитать кампании (Supabase или S3 недоступны).';
  if (status === 401) return 'Сессия истекла. Войдите снова.';
  if (error) return error;
  return `Ошибка ${status}`;
}

export function formatRub(kopecks: number | null): string {
  if (kopecks === null) return '—';
  return `${(kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Creative {
  format?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  action?: { href?: string; label?: string };
}

function creativeOf(c: ModeratedCampaign): Creative {
  return typeof c.creative === 'object' && c.creative !== null ? (c.creative as Creative) : {};
}

const DECISION_LABEL: Record<ModeratedCampaign['moderation']['decision'], string> = {
  pending: 'ждёт подтверждения',
  approved: 'подтверждена',
  rejected: 'отклонена',
};

const FORMAT_LABEL: Record<string, string> = {
  banner: 'баннер', popup: 'попап', fullscreen: 'фуллскрин', topline: 'топлайн', inline: 'инлайн', tooltip: 'тултип',
};

function CampaignCard({
  c, busy, onDecide,
}: {
  c: ModeratedCampaign;
  busy: boolean;
  onDecide: (decision: 'approved' | 'rejected') => void;
}) {
  const cr = creativeOf(c);
  const format = cr.format ?? c.format ?? '';
  return (
    <article className={`cmp-card${c.zeroBalance ? ' is-zero' : ''}`} data-campaign-id={c.id}>
      <div className="cmp-main">
        <div className="cmp-title">
          <span>{c.name ?? cr.title ?? `Кампания №${c.id}`}</span>
          <span className="aa-key">#{c.id}</span>
          {format && <span className={`badge badge-${format}`}>{FORMAT_LABEL[format] ?? format}</span>}
          <span className={`badge badge-mod-${c.moderation.decision}`}>{DECISION_LABEL[c.moderation.decision]}</span>
        </div>
        <div className="cmp-meta">
          <span>создана {formatWhen(c.createdAt)}</span>
          <span title={c.advertiserId}>рекламодатель {c.advertiserId.slice(0, 8)}…</span>
          <span>статус в ЛК: {c.status || '—'}</span>
        </div>

        <div className="cmp-facts">
          <div><div className="cmp-fact-label">CPM</div><div className="cmp-fact-value">{formatRub(c.cpmKopecks)}</div></div>
          <div><div className="cmp-fact-label">Бюджет всего</div><div className="cmp-fact-value">{c.totalBudgetKopecks === null ? 'без лимита' : formatRub(c.totalBudgetKopecks)}</div></div>
          <div><div className="cmp-fact-label">В день</div><div className="cmp-fact-value">{c.dailyBudgetKopecks === null ? 'без лимита' : formatRub(c.dailyBudgetKopecks)}</div></div>
          <div>
            <div className="cmp-fact-label">Баланс рекламодателя</div>
            <div className={`cmp-fact-value${c.zeroBalance ? ' is-danger' : ''}`}>{c.balanceKopecks === null ? 'нет данных' : formatRub(c.balanceKopecks)}</div>
          </div>
          <div><div className="cmp-fact-label">Страницы</div><div className="cmp-fact-value">{c.targetPages && c.targetPages.length > 0 ? c.targetPages.join(', ') : 'все'}</div></div>
          {(c.startsAt || c.endsAt) && (
            <div><div className="cmp-fact-label">Период</div><div className="cmp-fact-value">{formatWhen(c.startsAt)} — {formatWhen(c.endsAt)}</div></div>
          )}
        </div>

        {c.zeroBalance && (
          <div className="cmp-warn">
            У рекламодателя пустой кошелёк: даже после подтверждения кампания не будет откручиваться, пока он не пополнит баланс.
          </div>
        )}

        {(cr.title || cr.description || cr.imageUrl) && (
          <div className="cmp-creative">
            {cr.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cr.imageUrl} alt="" loading="lazy" />
            )}
            <div className="cmp-creative-text">
              {cr.title && <div className="cmp-creative-title">{cr.title}</div>}
              {cr.description && <div>{cr.description}</div>}
              {cr.action?.href && (
                <a href={cr.action.href} target="_blank" rel="noopener noreferrer nofollow" className="cmp-creative-link">
                  {cr.action.label || 'Ссылка'} ↗
                </a>
              )}
            </div>
          </div>
        )}

        {c.moderation.resubmittedAt && (
          <div className="cmp-meta"><span>отправлена повторно после отклонения {formatWhen(c.moderation.resubmittedAt)}</span></div>
        )}
        {c.moderation.decision !== 'pending' && (
          <div className="cmp-meta">
            <span>{DECISION_LABEL[c.moderation.decision]} {formatWhen(c.moderation.decidedAt ?? null)}</span>
            {c.moderation.decidedBy && <span>кем: {c.moderation.decidedBy}</span>}
            {c.moderation.reason && <span>причина: {c.moderation.reason}</span>}
          </div>
        )}
      </div>

      <div className="cmp-actions">
        {c.moderation.decision !== 'approved' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onDecide('approved')} data-track="campaign_approve" data-track-id={String(c.id)}>
            {busy ? '…' : 'Подтвердить'}
          </button>
        )}
        {c.moderation.decision !== 'rejected' && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => onDecide('rejected')} data-track="campaign_reject" data-track-id={String(c.id)}>
            {busy ? '…' : 'Отклонить'}
          </button>
        )}
      </div>
    </article>
  );
}

export function CampaignModerationPanel() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState('');

  const refresh = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch('/api/campaigns', { cache: 'no-store' });
    } catch {
      setLoad({ kind: 'error', message: 'Сеть недоступна — проверьте соединение.' });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as Partial<CampaignModerationListing> & { error?: string };
    if (!res.ok) {
      setLoad({ kind: 'error', message: describeError(res.status, data.error) });
      return;
    }
    setLoad({ kind: 'ready', listing: { pending: data.pending ?? [], recent: data.recent ?? [], channels: data.channels ?? [] } });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function decide(c: ModeratedCampaign, decision: 'approved' | 'rejected') {
    let reason: string | undefined;
    if (decision === 'rejected') {
      const answer = window.prompt(`Отклонить кампанию «${c.name ?? c.id}»? Причина (останется в истории):`, '');
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    setFlash('');
    setBusyId(c.id);
    let res: Response;
    try {
      res = await fetch('/api/campaigns/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaignId: c.id, decision, ...(reason ? { reason } : {}) }),
      });
    } catch {
      setBusyId(null);
      setFlash('Сеть недоступна — решение не сохранено.');
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!res.ok) {
      setFlash(`Не удалось сохранить решение: ${describeError(res.status, data.error)}`);
      return;
    }
    trackEvent(decision === 'approved' ? 'campaign_approve_success' : 'campaign_reject_success', { campaign_id: c.id });
    setFlash(decision === 'approved' ? `Кампания №${c.id} подтверждена — попадёт в аукцион в течение ~15 секунд.` : `Кампания №${c.id} отклонена.`);
    await refresh();
  }

  if (load.kind === 'loading') return <div className="empty">Загружаю кампании…</div>;
  if (load.kind === 'error') {
    return (
      <div className="empty">
        {load.message}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLoad({ kind: 'loading' }); void refresh(); }}>Повторить</button>
      </div>
    );
  }

  const { pending, recent, channels } = load.listing;
  return (
    <div>
      {channels.length === 0 && (
        <div className="leads-warn">
          У BFF не настроен ни один канал уведомлений (WEB_PUSH_VAPID_* или ADMIN_TELEGRAM_*): новые кампании копятся здесь, но пуши никому не уходят.
        </div>
      )}
      {flash && <div className="cmp-flash">{flash}</div>}

      <section className="aa-section">
        <div className="aa-section-title">Ждут подтверждения <span className="count-chip">{pending.length}</span></div>
        {pending.length === 0 ? (
          <div className="empty">Новых кампаний нет. Когда рекламодатель создаст кампанию, она появится здесь, а админам придёт пуш.</div>
        ) : (
          <div className="cmp-list">
            {pending.map((c) => (
              <CampaignCard key={c.id} c={c} busy={busyId === c.id} onDecide={(d) => decide(c, d)} />
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="aa-section">
          <div className="aa-section-title">Последние решения</div>
          <div className="cmp-list">
            {recent.map((c) => (
              <CampaignCard key={c.id} c={c} busy={busyId === c.id} onDecide={(d) => decide(c, d)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
