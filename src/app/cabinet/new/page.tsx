import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { PromoForm } from '@/components/PromoForm';

export default function NewPromoPage() {
  requireSession();
  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker"><Link href="/cabinet">← Очередь</Link></p>
          <h1>Новое промо</h1>
        </div>
      </div>
      <PromoForm mode="create" />
    </main>
  );
}
