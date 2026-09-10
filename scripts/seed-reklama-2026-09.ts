/**
 * Засев кампании «promo-reklama-2026-09»: креативы → S3 кабинета, восемь промо
 * из promos/*.json → пул, раскладка по очередям (home / tooltip /
 * persistent-inline / persistent-topline) в порядке из lib/reklama-seed.ts.
 *
 * Запуск (нужен S3-env кабинета + PROMO_PUBLIC_BASE или PROMO_CABINET_PUBLIC_BASE):
 *   ARCHIVE_DIR=/path/to/promo-reklama-2026-09 pnpm tsx scripts/seed-reklama-2026-09.ts
 *
 * По умолчанию — только план (ничего не пишет). APPLY=1 — выполнить.
 *   CREATIVES=gif|apng   — out/*.gif (дефолт) или out/*-anim.png
 *   PLACE=back|front     — куда ставить группу в очереди относительно чужих id (дефолт back)
 *   ENABLE_S2=1          — включить s2-popup-abandoned в очередь home (только после
 *                          того, как витрина шлёт form_id='ad_campaign'; иначе промо
 *                          никому не покажется)
 *   ENV_MODE=prod|test   — режим кабинета (дефолт prod; test = поддерево test/ в бакете)
 *
 * Идемпотентен: креативы перезаливаются на те же ключи, промо заменяются по id,
 * в очередях группа переставляется блоком, чужие id не трогаются.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { promoSchema, type Promo } from '../src/lib/schema';
import { ensureMainQueue, mutatePool, mutateQueue, readPool, readQueue } from '../src/lib/catalogue';
import { getS3Client } from '../src/lib/s3';
import { env } from '../src/env';
import type { EnvMode } from '../src/lib/env-mode';
import {
  CREATIVE_PLACEHOLDER, EXPECTED_IDS, SEED_QUEUES, creativeFileName, isGated, placeIds,
  referencedCreatives, rewriteCreativeUrls, upsertById, type CreativeKind,
} from '../src/lib/reklama-seed';

const ARCHIVE_DIR = process.env.ARCHIVE_DIR ?? '';
const APPLY = process.env.APPLY === '1';
const KIND: CreativeKind = process.env.CREATIVES === 'apng' ? 'apng' : 'gif';
const PLACE: 'front' | 'back' = process.env.PLACE === 'front' ? 'front' : 'back';
const ENABLE_S2 = process.env.ENABLE_S2 === '1';
const ENV_MODE: EnvMode = process.env.ENV_MODE === 'test' ? 'test' : 'prod';
const UPLOAD_DIR = 'promo-uploads/reklama-2026-09';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function publicBaseFor(relDir: string): string {
  const key = `${env.promoKeyPrefix}${relDir}`;
  if (env.promoPublicBase) return `${env.promoPublicBase.replace(/\/$/, '')}/${key}`;
  if (env.promoCabinetPublicBase) return `${env.promoCabinetPublicBase.replace(/\/$/, '')}/api/img/${relDir}`;
  return fail('задайте PROMO_PUBLIC_BASE (прямой S3/CDN) или PROMO_CABINET_PUBLIC_BASE (домен кабинета) — иначе URL креативов не собрать');
}

function loadPromos(dir: string): { file: string; raw: unknown }[] {
  const promosDir = join(dir, 'promos');
  if (!existsSync(promosDir)) fail(`нет каталога ${promosDir}`);
  return readdirSync(promosDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      const parsed: unknown = JSON.parse(readFileSync(join(promosDir, f), 'utf8'));
      return (Array.isArray(parsed) ? parsed : [parsed]).map((raw) => ({ file: f, raw }));
    });
}

async function main() {
  if (!ARCHIVE_DIR || !statSync(ARCHIVE_DIR, { throwIfNoEntry: false })?.isDirectory()) {
    fail('ARCHIVE_DIR должен указывать на распакованный архив promo-reklama-2026-09');
  }
  const base = publicBaseFor(UPLOAD_DIR);
  console.log(`режим: ${APPLY ? 'ЗАПИСЬ' : 'план (APPLY=1 — выполнить)'} · env ${ENV_MODE} · креативы ${KIND} · очередь: ${PLACE}`);
  console.log(`base креативов: ${base}`);

  // 1. Промо из архива: подстановка URL + валидация схемой кабинета.
  const loaded = loadPromos(ARCHIVE_DIR);
  const creativesNeeded = new Set<string>();
  const promos: Promo[] = [];
  const errors: string[] = [];
  for (const { file, raw } of loaded) {
    for (const c of referencedCreatives(raw)) creativesNeeded.add(creativeFileName(c, KIND));
    const rewritten = rewriteCreativeUrls(raw, { base, kind: KIND });
    const res = promoSchema.safeParse(rewritten);
    if (!res.success) {
      errors.push(`${file}: ${res.error.issues.map((i) => `${i.path.join('.') || '(root)'} — ${i.message}`).join('; ')}`);
      continue;
    }
    promos.push(res.data as Promo);
  }
  if (errors.length) fail(`невалидные промо:\n  ${errors.join('\n  ')}`);
  const ids = promos.map((p) => p.id);
  const missing = EXPECTED_IDS.filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !EXPECTED_IDS.includes(id));
  if (missing.length) fail(`в архиве нет промо: ${missing.join(', ')}`);
  if (extra.length) console.log(`! промо вне плана очередей (в пул попадут, в очереди — нет): ${extra.join(', ')}`);
  const leftover = JSON.stringify(promos).includes(CREATIVE_PLACEHOLDER);
  if (leftover) fail(`после подстановки осталась заглушка ${CREATIVE_PLACEHOLDER}`);

  // 2. Креативы: все, на которые ссылаются промо, должны лежать в out/.
  const outDir = join(ARCHIVE_DIR, 'out');
  const uploads = [...creativesNeeded].sort().map((name) => ({ name, path: join(outDir, name) }));
  const absent = uploads.filter((u) => !existsSync(u.path)).map((u) => u.name);
  if (absent.length) fail(`в ${outDir} нет файлов: ${absent.join(', ')}`);
  console.log(`\nкреативы (${uploads.length}) → s3://${env.promoBucket}/${env.promoKeyPrefix}${UPLOAD_DIR}/`);
  for (const u of uploads) console.log(`  ${u.name}  ${(statSync(u.path).size / 1024).toFixed(0)} KB`);

  // 3. План по пулу и очередям.
  const pool = await readPool(ENV_MODE);
  const poolIds = new Set(pool.map((p) => p.id));
  console.log('\nпул:');
  for (const p of promos) console.log(`  ${poolIds.has(p.id) ? 'replace' : 'add    '} ${p.id}  (${p.format}) «${p.name}»`);

  await ensureMainQueue(ENV_MODE);
  const queuePlans: { queue: string; before: string[]; after: string[]; skipped: string[] }[] = [];
  for (const q of SEED_QUEUES) {
    const before = (await readQueue(q.queue, ENV_MODE)).ids;
    const skipped = q.ids.filter((id) => isGated(id, ENABLE_S2));
    const group = q.ids.filter((id) => !skipped.includes(id));
    // Закрытые (s2) из очереди убираем, даже если стояли с прошлого запуска.
    const cleaned = before.filter((id) => !skipped.includes(id));
    queuePlans.push({ queue: q.queue, before, after: placeIds(cleaned, group, PLACE), skipped });
  }
  console.log('\nочереди:');
  for (const qp of queuePlans) {
    console.log(`  ${qp.queue}: [${qp.before.join(', ')}] → [${qp.after.join(', ')}]${qp.skipped.length ? `  (не включаем: ${qp.skipped.join(', ')})` : ''}`);
  }

  if (!APPLY) {
    console.log('\nплан показан, ничего не записано. APPLY=1 — выполнить.');
    return;
  }

  // 4. Запись: креативы → пул → очереди.
  const s3 = getS3Client();
  for (const u of uploads) {
    const key = `${env.promoKeyPrefix}${UPLOAD_DIR}/${u.name}`;
    await s3.send(new PutObjectCommand({
      Bucket: env.promoBucket,
      Key: key,
      Body: readFileSync(u.path),
      ContentType: u.name.endsWith('.png') ? 'image/png' : 'image/gif',
      CacheControl: 'public, max-age=31536000, immutable',
      ACL: 'public-read',
    }));
    console.log(`  ↑ ${key}`);
  }
  await mutatePool((current) => upsertById(current, promos), ENV_MODE);
  console.log(`  ✓ пул: ${promos.length} промо`);
  for (const qp of queuePlans) {
    await mutateQueue(qp.queue, (q) => ({ ...q, ids: qp.after }), ENV_MODE);
    console.log(`  ✓ ${qp.queue}: ${qp.after.length} ids`);
  }
  console.log('\nготово. Проверка: /cabinet/queues и smoke витрины.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
