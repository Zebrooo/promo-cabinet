import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { ENV_MODE_COOKIE } from '@/lib/env-mode';

export const runtime = 'nodejs';

const bodySchema = z.object({ env: z.enum(['prod', 'test']) });

/**
 * Переключает глобальный режим кабинета (Прод/Тест). Кука httpOnly — клиент
 * не может прочитать/подделать её напрямую, только через этот роут (за
 * сессией). После успешного ответа клиент делает location.reload(), чтобы
 * весь кабинет (серверные страницы + API) перечитался в новом режиме.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ENV_MODE_COOKIE, body.env, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    // Без maxAge — переживает рестарт браузера вместе с сессией; выйти из
    // режима можно только явным переключением, не истечением по времени.
  });
  return res;
}
