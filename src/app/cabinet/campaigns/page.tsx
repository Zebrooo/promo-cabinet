import { requireSession } from '@/lib/require-session';
import { env } from '@/env';
import { RecentCampaignsList } from '@/components/RecentCampaignsList';
import { PushToggle } from '@/components/PushToggle';

export const dynamic = 'force-dynamic';

/**
 * «Кампании» — новые рекламные кампании рекламодателей витрины и подписка на
 * пуши о них. Кампании живут в abkhaz-Supabase за promo-bff (не в S3-пуле
 * промо кабинета), поэтому глобальный режим Прод/Тест на них не влияет.
 *
 * VAPID-ключ читается на сервере при каждом запросе (не NEXT_PUBLIC_*): образ
 * собирается без секретов, а ключ задаётся в рантайме через env_file.
 */
export default function CampaignsPage() {
  requireSession();
  return (
    <div>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">АДМИНКА</div>
          <h1>Новые кампании рекламодателей</h1>
        </div>
        <div className="right">
          <PushToggle vapidPublicKey={env.webPushVapidPublicKey} />
        </div>
      </div>
      <p className="cmp-intro">
        О каждой новой кампании из ЛК «Реклама» BFF шлёт админам уведомление — включите пуши в этом браузере
        кнопкой справа. Ниже — последние кампании, о которых уведомления уже уходили.
      </p>
      <RecentCampaignsList />
    </div>
  );
}
