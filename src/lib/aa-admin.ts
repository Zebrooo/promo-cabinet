/**
 * Общая прослойка для API-роутов раздела «Abkhaz Auto» (пульт канарейки +
 * эксперименты, /api/aa/**). Каждый роут: проверяет сессию кабинета, валидирует
 * env (test|prod), зовёт aaAdminPost и прозрачно транслирует ответ/ошибку BFF —
 * логика транслирования у всех одинаковая, вынесена сюда, чтобы не расходиться
 * по мелочи между 8 файлами.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { aaAdminPost } from '@/lib/bff-client';
import { readEnvMode } from '@/lib/env-mode';

/** Сетевой сбой/таймаут до BFF — сам BFF недоступен, это не бизнес-ошибка ручки. */
function bffUnreachable(): NextResponse {
  return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
}

/**
 * Зовёт aa-admin ручку BFF и пробрасывает её ответ 1-в-1: BFF уже возвращает
 * осмысленные коды (409 canary_not_active, 503 env_not_configured, 400 на
 * невалидные поля) и объясняющее тело — кабинету достаточно retranslate,
 * без своей семантики поверх.
 *
 * env (prod/test) — ТОЛЬКО из httpOnly-куки режима кабинета, как у промо и
 * очередей: поле `env` в теле запроса игнорируется, иначе из режима «Тест»
 * можно было бы крутить канарейку и эксперименты прода.
 */
export async function proxyToAaAdmin(req: NextRequest, path: string, body: Record<string, unknown>): Promise<NextResponse> {
  try {
    const { status, body: respBody } = await aaAdminPost(path, { ...body, env: readEnvMode(req.cookies) });
    return NextResponse.json(respBody, { status });
  } catch {
    return bffUnreachable();
  }
}
