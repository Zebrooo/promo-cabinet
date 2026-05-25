import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { readCatalogue } from '@/lib/catalogue';
import { PromoForm } from '@/components/PromoForm';

export const dynamic = 'force-dynamic';

export default async function EditPromoPage({ params }: { params: { id: string } }) {
  requireSession();
  const { promos } = await readCatalogue();
  const promo = promos.find((p) => p.id === params.id);
  if (!promo) notFound();
  return (
    <main>
      <h1>Редактирование: {promo.title}</h1>
      <PromoForm mode="edit" initial={promo} />
    </main>
  );
}
