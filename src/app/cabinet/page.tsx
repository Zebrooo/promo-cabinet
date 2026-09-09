import { cookies } from 'next/headers';
import { requireSession } from '@/lib/require-session';
import { readPool, readMembership } from '@/lib/catalogue';
import { readEnvMode } from '@/lib/env-mode';
import { buildFacetContext, parseFilters } from '@/lib/promo-filters';
import { PromoList } from '@/components/PromoList';

export const dynamic = 'force-dynamic';

/**
 * «Все промо». Состояние фильтров живёт в URL (?status=…&format=…): сервер
 * разбирает его один раз, чтобы первый рендер уже был отфильтрован и ссылку
 * на выборку можно было передать коллеге; дальше клиент правит URL сам через
 * history.replaceState — без повторных S3-чтений на каждый клик по чипу.
 */
export default async function CabinetPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  requireSession();
  const envMode = readEnvMode(cookies());
  try {
    const [promos, { queueNames, membership }] = await Promise.all([readPool(envMode), readMembership(envMode)]);
    // Один «сейчас» на сервер и клиент — иначе статусы/дни до конца могут
    // разъехаться на гидрации.
    const now = Date.now();
    const initial = parseFilters(searchParams, buildFacetContext(promos, membership, queueNames, now));
    return <PromoList promos={promos} membership={membership} queueNames={queueNames} initial={initial} now={now} />;
  } catch (err) {
    console.error('[cabinet] failed to read pool/queues from S3', err);
    return <p className="empty">Не удалось прочитать данные из S3.</p>;
  }
}
