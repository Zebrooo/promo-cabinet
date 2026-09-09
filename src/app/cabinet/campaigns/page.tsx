import { requireSession } from '@/lib/require-session';
import { env } from '@/env';
import { CampaignModerationPanel } from '@/components/CampaignModerationPanel';
import { PushToggle } from '@/components/PushToggle';

export const dynamic = 'force-dynamic';

/**
 * «Кампании» — модерация рекламных кампаний рекламодателей витрины. Кампании
 * живут в abkhaz-Supabase за promo-bff (не в S3-пуле промо кабинета), поэтому
 * глобальный режим Прод/Тест на них не влияет: BFF работает с той базой, по
 * которой крутит аукцион.
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
          <h1>Кампании рекламодателей</h1>
        </div>
        <div className="right">
          <PushToggle vapidPublicKey={env.webPushVapidPublicKey} />
        </div>
      </div>
      <p className="cmp-intro">
        Новая кампания из ЛК «Реклама» не попадает в аукцион, пока её не подтвердит админ. О каждой новой кампании
        BFF шлёт уведомление — включите пуши в этом браузере кнопкой справа.
      </p>
      <CampaignModerationPanel />
    </div>
  );
}
