import { requireSession } from '@/lib/require-session';
import { PromoForm } from '@/components/PromoForm';

export default function NewPromoPage() {
  requireSession();
  return (
    <main>
      <h1>Новое промо</h1>
      <PromoForm mode="create" />
    </main>
  );
}
