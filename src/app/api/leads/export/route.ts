import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { isAuthed } from '@/lib/api-auth';
import { getLeads } from '@/lib/bff-client';
import { readEnvMode } from '@/lib/env-mode';
import { readQueuesIndex, readQueue } from '@/lib/catalogue';
import {
  LEAD_COLUMNS,
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

  const params = req.nextUrl.searchParams;
  const promoId = params.get('promoId') ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;

  let rows;
  try {
    const leads = await getLeads({ promoId, from, to });
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
