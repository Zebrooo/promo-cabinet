import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { readCatalogue } from '@/lib/catalogue';
import { PromoList } from '@/components/PromoList';

export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  requireSession();
  let promos;
  try {
    ({ promos } = await readCatalogue());
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Список промо</h1></div>
        <p className="error">Не удалось прочитать каталог из S3.</p>
      </main>
    );
  }
  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker">Каталог</p>
          <h1>Список промо <span className="count-badge">{promos.length}</span></h1>
        </div>
        <Link className="btn btn--primary" href="/cabinet/new">+ Новое промо</Link>
      </div>
      {promos.length === 0
        ? <div className="empty">Промо пока нет. Создайте первое — оно появится здесь и встанет в очередь.</div>
        : <PromoList promos={promos} />}
    </main>
  );
}
