import { cookies } from 'next/headers';
import { requireSession } from '@/lib/require-session';
import { readPool, readQueuesIndex, readQueue } from '@/lib/catalogue';
import { readEnvMode } from '@/lib/env-mode';
import { PromoList } from '@/components/PromoList';

export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  requireSession();
  const envMode = readEnvMode(cookies());
  try {
    const [promos, queuesIndex] = await Promise.all([readPool(envMode), readQueuesIndex(envMode)]);

    // Build membership map: promoId → queue names[]
    const membership: Record<string, string[]> = {};
    const objs = await Promise.all(queuesIndex.map((q) => readQueue(q.name, envMode)));
    queuesIndex.forEach((q, i) => {
      for (const id of objs[i].ids) {
        if (!membership[id]) membership[id] = [];
        membership[id].push(q.name);
      }
    });

    const queueNames = queuesIndex.map((q) => q.name);

    return <PromoList promos={promos} membership={membership} queueNames={queueNames} />;
  } catch {
    return <p className="empty">Не удалось прочитать данные из S3.</p>;
  }
}
