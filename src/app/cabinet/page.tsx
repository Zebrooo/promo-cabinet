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
    return (
      <main>
        <div className="pagehead"><h1>Очередь промо</h1></div>
        <p className="error">Не удалось прочитать каталог из S3.</p>
      </main>
    );
  }
  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker">Каталог · catalogue.json</p>
          <h1>Очередь промо <span className="count-badge mono">{promos.length}</span></h1>
        </div>
        <Link className="btn btn--primary linklike" href="/cabinet/new">
          <span className="plus">+</span> Новое промо
        </Link>
      </div>
      {promos.length === 0
        ? <div className="empty">Промо пока нет. Создайте первое — оно встанет в начало очереди.</div>
        : <PromoTable promos={promos} />}
    </main>
  );
}
