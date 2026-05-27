import { requireSession } from '@/lib/require-session';
import { PromoForm } from '@/components/PromoForm';

export default function NewPromoPage() {
  requireSession();
  return <PromoForm mode="create" />;
}
