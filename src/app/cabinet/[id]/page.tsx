import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { readPool, readMembership } from '@/lib/catalogue';
import { readEnvMode } from '@/lib/env-mode';
import { PromoForm } from '@/components/promo-form/PromoForm';
import { PromoAnalyticsBlock } from '@/components/PromoAnalyticsBlock';

export const dynamic = 'force-dynamic';

/** ?created=1 ставит форма сразу после первого сохранения: промо ещё ни в
 *  одной очереди, и человеку нужно сказать, что делать дальше. */
const CREATED_NOTICE = 'Промо создано. Теперь добавьте его в очереди показа — без очереди витрина его не покажет.';

export default async function EditPromoPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string };
}) {
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
        notice={searchParams.created ? CREATED_NOTICE : undefined}
      />
    </>
  );
}
