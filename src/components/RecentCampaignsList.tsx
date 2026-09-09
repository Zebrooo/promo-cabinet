'use client';
// Последние новые рекламные кампании рекламодателей, о которых BFF слал пуши
// админам. Только чтение: кампании живут за BFF (abkhaz-Supabase), поэтому,
// как и в AbkhazAutoPanel, серверного pre-fetch нет — грузится при монтировании.
import { useCallback, useEffect, useState } from 'react';
import type { RecentCampaign, RecentCampaignsListing } from '@/lib/bff-client';

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; listing: RecentCampaignsListing };

function describeError(status: number, error?: string): string {
  if (status === 503 && error === 'campaigns_not_configured') return 'В BFF не настроена Supabase витрины (AA_SUPABASE_URL/KEY) — кампании не читаются.';
  if (status === 502 && error === 'bff_unreachable') return 'BFF недоступен — попробуйте позже.';
  if (status === 502) return 'BFF не смог прочитать кампании (Supabase или S3 недоступны).';
  if (status === 401) return 'Сессия истекла. Войдите снова.';
  if (error) return error;
  return `Ошибка ${status}`;
}

export function formatRub(kopecks: number): string {
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

const FORMAT_LABEL: Record<string, string> = {
  banner: 'баннер', popup: 'попап', fullscreen: 'фуллскрин', topline: 'топлайн', inline: 'инлайн', tooltip: 'тултип',
};

function CampaignCard({ c }: { c: RecentCampaign }) {
  const cr: Creative = typeof c.creative === 'object' && c.creative !== null ? (c.creative as Creative) : {};
  const format = cr.format ?? c.format ?? '';
  return (
    <article className="cmp-card" data-campaign-id={c.id}>
      <div className="cmp-main">
        <div className="cmp-title">
          <span>{c.name ?? cr.title ?? `Кампания №${c.id}`}</span>
          <span className="aa-key">#{c.id}</span>
          {format && <span className={`badge badge-${format}`}>{FORMAT_LABEL[format] ?? format}</span>}
        </div>
        <div className="cmp-meta">
          <span>создана {formatWhen(c.createdAt)}</span>
          <span title={c.advertiserId}>рекламодатель {c.advertiserId.slice(0, 8)}…</span>
          <span>статус: {c.status || '—'}</span>
          {c.notifiedAt
            ? <span className="cmp-sent">пуш отправлен {formatWhen(c.notifiedAt)}</span>
            : <span>пуш не доставлен (нет подписчиков или канал не настроен)</span>}
        </div>

        <div className="cmp-facts">
          <div><div className="cmp-fact-label">CPM</div><div className="cmp-fact-value">{formatRub(c.cpmKopecks)}</div></div>
          <div><div className="cmp-fact-label">Бюджет всего</div><div className="cmp-fact-value">{c.totalBudgetKopecks === null ? 'без лимита' : formatRub(c.totalBudgetKopecks)}</div></div>
          <div><div className="cmp-fact-label">В день</div><div className="cmp-fact-value">{c.dailyBudgetKopecks === null ? 'без лимита' : formatRub(c.dailyBudgetKopecks)}</div></div>
          <div><div className="cmp-fact-label">Страницы</div><div className="cmp-fact-value">{c.targetPages && c.targetPages.length > 0 ? c.targetPages.join(', ') : 'все'}</div></div>
        </div>

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
      </div>
    </article>
  );
}

export function RecentCampaignsList() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch('/api/campaigns', { cache: 'no-store' });
    } catch {
      setLoad({ kind: 'error', message: 'Сеть недоступна — проверьте соединение.' });
      return;
    }
    const data = (await res.json().catch(() => ({}))) as Partial<RecentCampaignsListing> & { error?: string };
    if (!res.ok) {
      setLoad({ kind: 'error', message: describeError(res.status, data.error) });
      return;
    }
    setLoad({ kind: 'ready', listing: { campaigns: data.campaigns ?? [], channels: data.channels ?? [] } });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (load.kind === 'loading') return <div className="empty">Загружаю кампании…</div>;
  if (load.kind === 'error') {
    return (
      <div className="empty">
        {load.message}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLoad({ kind: 'loading' }); void refresh(); }}>Повторить</button>
      </div>
    );
  }

  const { campaigns, channels } = load.listing;
  return (
    <div>
      {channels.length === 0 && (
        <div className="leads-warn">
          У BFF не настроен ни один канал уведомлений (WEB_PUSH_VAPID_* или ADMIN_TELEGRAM_*) — пуши о новых кампаниях никому не уходят.
        </div>
      )}
      <section className="aa-section">
        <div className="aa-section-title">Последние новые кампании <span className="count-chip">{campaigns.length}</span></div>
        {campaigns.length === 0 ? (
          <div className="empty">Новых кампаний с момента включения уведомлений ещё не было.</div>
        ) : (
          <div className="cmp-list">
            {campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}
          </div>
        )}
      </section>
    </div>
  );
}
