import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { PushCampaignsList } from '@/components/PushCampaignsList';

export const dynamic = 'force-dynamic';

/**
 * «Push-рассылки» — FCM-пуши пользователям витрины. Черновики хранит BFF
 * (S3 push-campaigns.json), рассылает витрина abkhaz-auto; кабинет — форма и
 * список. Глобальный режим Прод/Тест на рассылки не влияет: получатели —
 * живые пользователи, отдельного тестового стенда для пушей нет.
 */
export default function PushCampaignsPage() {
  requireSession();
  return (
    <div>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">ПОЛЬЗОВАТЕЛИ ВИТРИНЫ</div>
          <h1>Push-рассылки</h1>
        </div>
        <div className="right">
          <Link href="/cabinet/push/new" className="btn btn-primary" data-track="push_campaign_new">+ Новая рассылка</Link>
        </div>
      </div>
      <p className="cmp-intro">
        Пуш уходит всем пользователям приложения с включёнными уведомлениями (FCM-токены в abkhaz-auto).
        Фильтры таргетинга сохраняются вместе с рассылкой — отбор получателей по ним подключим следующим этапом.
      </p>
      <PushCampaignsList />
    </div>
  );
}
