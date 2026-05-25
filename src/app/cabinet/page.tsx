import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { readCatalogue } from '@/lib/catalogue';
import { PromoTable } from '@/components/PromoTable';

export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  requireSession();
  let promos;
  try {
    ({ promos } = await readCatalogue());
  } catch {
    return <main><h1>Очередь промо</h1><p className="error">Не удалось прочитать каталог из S3.</p></main>;
  }
  return (
    <main>
      <h1>Очередь промо</h1>
      <p><Link href="/cabinet/new">+ Новое промо</Link></p>
      {promos.length === 0 ? <p>Промо пока нет.</p> : <PromoTable promos={promos} />}
    </main>
  );
}
