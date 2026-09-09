import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { readPool, readMembership } from '@/lib/catalogue';
import { readEnvMode } from '@/lib/env-mode';
import { PromoForm } from '@/components/PromoForm';
import { PromoAnalyticsBlock } from '@/components/PromoAnalyticsBlock';

export const dynamic = 'force-dynamic';

export default async function EditPromoPage({ params }: { params: { id: string } }) {
  requireSession();
  const envMode = readEnvMode(cookies());

  const [promos, { queueNames, membership: all }] = await Promise.all([readPool(envMode), readMembership(envMode)]);
  const promo = promos.find((p) => p.id === params.id);
  if (!promo) notFound();
  const membership = all[promo.id] ?? [];

  return (
    <>
      <PromoAnalyticsBlock promoId={promo.id} />
      <div style={{ height: 24 }} />
      <PromoForm
        mode="edit"
        initial={promo}
        queueNames={queueNames}
        membership={membership}
        poolPromos={promos.map((p) => ({ id: p.id, title: p.title }))}
      />
    </>
  );
}
