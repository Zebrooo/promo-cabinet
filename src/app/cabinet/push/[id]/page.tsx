import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { getPushCampaign } from '@/lib/bff-client';
import { toPushCampaignForm, type PushCampaign } from '@/lib/push-campaign-schema';
import { formatPushWhen, formatSendResult, pushTargetingSummary } from '@/lib/push-campaign-summary';
import { PushCampaignForm } from '@/components/push-campaign-form/PushCampaignForm';

export const dynamic = 'force-dynamic';

/** Отправленная рассылка — только чтение: BFF её не правит (409 already_sent),
 *  а форма с задизейбленными фильтрами таргетинга вводила бы в заблуждение. */
function SentCampaignView({ c }: { c: PushCampaign }) {
  const targeting = pushTargetingSummary(c);
  return (
    <div>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">ОТПРАВЛЕНО {formatPushWhen(c.sentAt)}</div>
          <h1>{c.title}</h1>
        </div>
        <div className="right">
          <Link href="/cabinet/push" className="btn btn-secondary">← К списку рассылок</Link>
        </div>
      </div>
      <article className="cmp-card push-card is-sent">
        <div className="cmp-title"><span>{c.title}</span><span className="badge badge-active">ОТПРАВЛЕНО</span><span className="aa-key">{c.id}</span></div>
        <div className="push-body">{c.body}</div>
        <div className="cmp-facts">
          <div><div className="cmp-fact-label">Ссылка</div><div className="cmp-fact-value mono">{c.url}</div></div>
          <div><div className="cmp-fact-label">Иконка</div><div className="cmp-fact-value">{c.icon ? <span className="mono">{c.icon}</span> : 'нет'}</div></div>
          <div><div className="cmp-fact-label">Итог</div><div className="cmp-fact-value">{formatSendResult(c.sendResult)}</div></div>
          <div><div className="cmp-fact-label">Создано</div><div className="cmp-fact-value">{formatPushWhen(c.createdAt)}</div></div>
        </div>
        <div className="cmp-meta" style={{ marginTop: 12 }}>
          {targeting.length === 0
            ? <span>Таргетинг: все пользователи</span>
            : targeting.map((t) => <span key={t}>{t}</span>)}
        </div>
      </article>
    </div>
  );
}

export default async function PushCampaignPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  requireSession();
  let res: Awaited<ReturnType<typeof getPushCampaign>>;
  try {
    res = await getPushCampaign(params.id);
  } catch {
    return <p className="empty">BFF недоступен — не удалось прочитать рассылку.</p>;
  }
  if (res.status === 404) notFound();
  if (res.status !== 200 || !('campaign' in res.body)) {
    return <p className="empty">Не удалось прочитать рассылку (ошибка {res.status}).</p>;
  }
  const { campaign, broadcastConfigured } = res.body;
  if (campaign.status === 'sent') return <SentCampaignView c={campaign} />;
  // ?error= — сообщение неудачной отправки с /new: черновик уже создан, и
  // повторная попытка должна идти отсюда, а не плодить дубли.
  const lastSendError = searchParams.error?.trim() || campaign.lastSendError;
  return (
    <PushCampaignForm
      mode="edit"
      initial={toPushCampaignForm(campaign)}
      broadcastConfigured={broadcastConfigured === true}
      lastSendError={lastSendError}
    />
  );
}
