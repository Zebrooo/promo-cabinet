import Link from 'next/link';
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
      <div className="pagehead">
        <div>
          <p className="kicker"><Link href="/cabinet">← Очередь</Link></p>
          <h1>Редактирование <span className="mono" style={{ color: 'var(--accent-hover)' }}>{promo.id}</span></h1>
        </div>
      </div>
      <PromoForm mode="edit" initial={promo} />
    </main>
  );
}
