import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { readState } from '@/lib/catalogue';
import { PromoForm } from '@/components/PromoForm';
import type { Promo } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function EditPromoPage({ params }: { params: { id: string } }) {
  requireSession();
  let promos: Promo[];
  ({ promos } = await readState());
  const promo = promos.find((p) => p.id === params.id);
  if (!promo) notFound();
  return <PromoForm mode="edit" initial={promo} />;
}
