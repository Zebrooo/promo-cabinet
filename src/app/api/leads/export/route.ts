import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { isAuthed } from '@/lib/api-auth';
import { getLeads } from '@/lib/bff-client';
import { readEnvMode } from '@/lib/env-mode';
import { readQueuesIndex, readQueue } from '@/lib/catalogue';
import {
  LEAD_COLUMNS,
  LEADS_LIMIT,
  moscowDayRange,
  queuesByPromo,
  reportFileName,
  toRows,
  toSheetMatrix,
} from '@/lib/leads-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/export?promoId=&from=&to= → .xlsx с заявками «Связаться».
 *
 * Это отчёт, который мы отдаём рекламодателю (спека
 * 2026-08-19-promo-hot-lead-design §6): когда пришла заявка, от кого и по
 * какому промо. Фильтры те же, что у страницы /cabinet/leads, — файл и
 * таблица на экране всегда показывают одно и то же.
 *
 * ⚠️ В файле ПДн (телефоны). Отдаём только авторизованному кабинету.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Параметры — те же, что у страницы /cabinet/leads: id кампании и ДНИ
  // (YYYY-MM-DD). Границы периода считает та же moscowDayRange, поэтому файл
  // повторяет ровно то, что видно на экране, а ссылку можно скопировать
  // из адресной строки.
  const params = req.nextUrl.searchParams;
  const promoId = params.get('promoId')?.trim() || undefined;
  const { from, to } = moscowDayRange(
    params.get('from') ?? undefined,
    params.get('to') ?? undefined,
  );

  let rows;
  try {
    // Тот же потолок, что у страницы: расхождение «на экране 5000, в файле 500»
    // было бы худшим из вариантов. Страница предупреждает, когда упёрлись.
    const leads = await getLeads({ promoId, from, to, limit: LEADS_LIMIT });
    // Очередь промо знает только кабинет — сайт её в заявке не передаёт.
    // Падение S3 не должно ронять выгрузку: тогда колонка «Очередь» пустая.
    const queues = await readAllQueues(readEnvMode(req.cookies)).catch(() => new Map<string, string[]>());
    rows = toRows(leads, queues);
  } catch {
    return NextResponse.json({ error: 'leads_unavailable' }, { status: 502 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Лиды');
  sheet.columns = LEAD_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const [, ...body] = toSheetMatrix(rows);
  for (const row of body) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${reportFileName(promoId)}"`,
      'cache-control': 'no-store',
    },
  });
}

async function readAllQueues(env: ReturnType<typeof readEnvMode>): Promise<Map<string, string[]>> {
  const index = await readQueuesIndex(env);
  const entries = await Promise.all(
    index.map(async ({ name }) => [name, await readQueue(name, env)] as const),
  );
  return queuesByPromo(Object.fromEntries(entries));
}
