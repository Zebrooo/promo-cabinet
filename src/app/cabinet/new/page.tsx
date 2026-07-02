import { requireSession } from '@/lib/require-session';
import { readPool, readQueuesIndex } from '@/lib/catalogue';
import { PromoForm } from '@/components/PromoForm';

export const dynamic = 'force-dynamic';

export default async function NewPromoPage() {
  requireSession();
  // Show the queue chips but disable them until first save — membership is
  // empty for a new promo, queueNames are the available queues. The pool
  // feeds the chain-predecessor <datalist>.
  const [queuesIndex, promos] = await Promise.all([
    readQueuesIndex().catch(() => []),
    readPool().catch(() => []),
  ]);
  const queueNames = queuesIndex.map((q) => q.name);
  const poolPromos = promos.map((p) => ({ id: p.id, title: p.title }));
  return <PromoForm mode="create" queueNames={queueNames} membership={[]} poolPromos={poolPromos} />;
}
