import { requireSession } from '@/lib/require-session';
import { readQueuesIndex } from '@/lib/catalogue';
import { PromoForm } from '@/components/PromoForm';

export const dynamic = 'force-dynamic';

export default async function NewPromoPage() {
  requireSession();
  // Show the queue chips but disable them until first save — membership is
  // empty for a new promo, queueNames are the available queues.
  const queuesIndex = await readQueuesIndex().catch(() => []);
  const queueNames = queuesIndex.map((q) => q.name);
  return <PromoForm mode="create" queueNames={queueNames} membership={[]} />;
}
