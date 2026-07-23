/**
 * Первичный засев per-device очередей (Фаза 2 рефактора web/touch/mobile).
 *
 * Для каждого storefront-каталога создаёт три независимых пула из СТАРОЙ
 * catalog-очереди:
 *   queue-<catalog>-web.json    = копия queue-<catalog>.json
 *   queue-<catalog>-touch.json  = копия queue-<catalog>.json
 *   queue-<catalog>-mobile.json = копия БЕЗ app-download промо (go-mobile и пр.)
 *     — внутри приложения звать «скачай приложение» бессмысленно.
 *
 * Идемпотентно: device-очередь с УЖЕ непустыми ids не трогается (не затираем
 * то, что успел завести рекламодатель). Пустую/отсутствующую — заполняет.
 * Регистрирует новые имена в queues-индексе.
 *
 * Запуск (нужен S3-env кабинета): `pnpm tsx scripts/seed-device-queues.ts`
 *   DRY=1 pnpm tsx scripts/seed-device-queues.ts   — только показать план.
 */
import {
  readQueue,
  writeQueue,
  readQueuesIndex,
  writeQueuesIndex,
  DEVICE_QUEUE_CATALOGS,
  QUEUE_DEVICES,
} from '../src/lib/catalogue';

// Промо, которые НЕ должны попадать в mobile-очереди (уже в приложении).
const APP_DOWNLOAD_IDS = new Set<string>(['go-mobile']);

const DRY = process.env.DRY === '1';

async function main() {
  const index = await readQueuesIndex();
  const known = new Set(index.map((q) => q.name));
  const toRegister: { name: string; persist: boolean }[] = [];
  let filled = 0;
  let skipped = 0;

  for (const catalog of DEVICE_QUEUE_CATALOGS) {
    const source = await readQueue(catalog); // старая catalog-очередь
    for (const device of QUEUE_DEVICES) {
      const name = `${catalog}-${device}`;
      const target = await readQueue(name);

      if (target.ids.length > 0) {
        console.log(`  skip  ${name} (уже ${target.ids.length} ids)`);
        skipped++;
      } else {
        const ids =
          device === 'mobile'
            ? source.ids.filter((id) => !APP_DOWNLOAD_IDS.has(id))
            : [...source.ids];
        console.log(
          `  fill  ${name} ← ${catalog} (${ids.length} ids${
            device === 'mobile' && ids.length !== source.ids.length ? ', app-download убраны' : ''
          })`,
        );
        // persist:false — device-пулы non-persist по дизайну (как в
        // DEVICE_QUEUES/ensureMainQueue); НЕ наследуем от source, чтобы сидер и
        // bootstrap не разошлись, если каталожную очередь когда-то сделают persist.
        if (!DRY) await writeQueue(name, { persist: false, ids });
        filled++;
      }

      if (!known.has(name)) toRegister.push({ name, persist: false });
    }
  }

  if (toRegister.length) {
    console.log(`\n  index += ${toRegister.length} очередей: ${toRegister.map((q) => q.name).join(', ')}`);
    if (!DRY) await writeQueuesIndex([...index, ...toRegister]);
  }

  console.log(
    `\n${DRY ? '[DRY] ' : ''}Готово: заполнено ${filled}, пропущено ${skipped}, ` +
      `зарегистрировано ${toRegister.length}.`,
  );
}

main().catch((err) => {
  console.error('seed-device-queues failed:', err);
  process.exit(1);
});
