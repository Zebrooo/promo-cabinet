import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { readPool, readQueuesIndex, readQueue } from '@/lib/catalogue';
import { PromoForm } from '@/components/PromoForm';
import { PromoAnalyticsBlock } from '@/components/PromoAnalyticsBlock';

export const dynamic = 'force-dynamic';

export default async function EditPromoPage({ params }: { params: { id: string } }) {
  requireSession();

  const [promos, queuesIndex] = await Promise.all([readPool(), readQueuesIndex()]);
  const promo = promos.find((p) => p.id === params.id);
  if (!promo) notFound();

  // Build membership list for THIS promo only.
  const queueObjs = await Promise.all(queuesIndex.map((q) => readQueue(q.name)));
  const membership = queuesIndex
    .map((q, i) => (queueObjs[i].ids.includes(promo.id) ? q.name : null))
    .filter((x): x is string => x !== null);
  const queueNames = queuesIndex.map((q) => q.name);

  return (
    <>
      <PromoAnalyticsBlock promoId={promo.id} />
      <div style={{ height: 24 }} />
      <PromoForm
        mode="edit"
        initial={promo}
        queueNames={queueNames}
        membership={membership}
      />
    </>
  );
}
