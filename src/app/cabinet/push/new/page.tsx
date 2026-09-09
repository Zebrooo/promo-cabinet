import { requireSession } from '@/lib/require-session';
import { listPushCampaigns } from '@/lib/bff-client';
import { PushCampaignForm } from '@/components/push-campaign-form/PushCampaignForm';

export const dynamic = 'force-dynamic';

export default async function NewPushCampaignPage() {
  requireSession();
  // Только флаг «BFF умеет рассылать» — чтобы кнопка «Отправить» честно
  // объясняла, почему выключена. Недоступный BFF не должен ронять форму:
  // черновик всё равно не сохранится, но ошибку покажет сам сабмит.
  const broadcastConfigured = await listPushCampaigns()
    .then((r) => r.status === 200 && 'broadcastConfigured' in r.body && r.body.broadcastConfigured === true)
    .catch(() => false);
  return <PushCampaignForm mode="create" broadcastConfigured={broadcastConfigured} />;
}
