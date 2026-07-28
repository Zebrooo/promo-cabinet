/**
 * Общая прослойка для API-роутов раздела «Abkhaz Auto» (пульт канарейки +
 * эксперименты, /api/aa/**). Каждый роут: проверяет сессию кабинета, валидирует
 * env (test|prod), зовёт aaAdminPost и прозрачно транслирует ответ/ошибку BFF —
 * логика транслирования у всех одинаковая, вынесена сюда, чтобы не расходиться
 * по мелочи между 8 файлами.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { aaAdminPost } from '@/lib/bff-client';

export const aaEnvSchema = z.enum(['test', 'prod']);
export type AaEnv = z.infer<typeof aaEnvSchema>;

/** Сетевой сбой/таймаут до BFF — сам BFF недоступен, это не бизнес-ошибка ручки. */
function bffUnreachable(): NextResponse {
  return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
}

/**
 * Зовёт aa-admin ручку BFF и пробрасывает её ответ 1-в-1: BFF уже возвращает
 * осмысленные коды (409 canary_not_active, 503 env_not_configured, 400 на
 * невалидные поля) и объясняющее тело — кабинету достаточно retranslate,
 * без своей семантики поверх.
 */
export async function proxyToAaAdmin(path: string, body: Record<string, unknown>): Promise<NextResponse> {
  try {
    const { status, body: respBody } = await aaAdminPost(path, body);
    return NextResponse.json(respBody, { status });
  } catch {
    return bffUnreachable();
  }
}
