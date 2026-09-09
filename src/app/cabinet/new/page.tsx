import { cookies } from 'next/headers';
import { requireSession } from '@/lib/require-session';
import { readPool, readQueuesIndex } from '@/lib/catalogue';
import { readEnvMode } from '@/lib/env-mode';
import { duplicatePromo } from '@/lib/duplicate-promo';
import { PromoForm } from '@/components/promo-form/PromoForm';

export const dynamic = 'force-dynamic';

/**
 * Новое промо. `?from=<id>` — копия существующего: форма открывается с его
 * форматом, контентом, таргетингом и лимитами, новым id и пометкой в
 * названии (lib/duplicate-promo.ts). Очереди не копируются — их назначают
 * после первого сохранения, как у любого нового промо.
 */
export default async function NewPromoPage({ searchParams }: { searchParams: { from?: string } }) {
  requireSession();
  const envMode = readEnvMode(cookies());
  // Show the queue chips but disable them until first save — membership is
  // empty for a new promo, queueNames are the available queues. The pool
  // feeds the chain-predecessor <datalist> (and the copy, if asked for one).
  const [queuesIndex, promos] = await Promise.all([
    readQueuesIndex(envMode).catch(() => []),
    readPool(envMode).catch(() => []),
  ]);
  const queueNames = queuesIndex.map((q) => q.name);
  const poolPromos = promos.map((p) => ({ id: p.id, title: p.title }));

  const fromId = searchParams.from?.trim();
  const source = fromId ? promos.find((p) => p.id === fromId) : undefined;
  const initial = source ? duplicatePromo(source, promos) : undefined;
  const notice = !fromId
    ? undefined
    : source
      ? `Это копия промо «${source.title}» (${source.id}). Проверьте ID, название и даты показа — очереди нужно будет назначить после сохранения.`
      : `Промо «${fromId}» не найдено в пуле — форма открыта пустой.`;

  return (
    <PromoForm
      mode="create"
      initial={initial}
      queueNames={queueNames}
      membership={[]}
      poolPromos={poolPromos}
      notice={notice}
    />
  );
}
