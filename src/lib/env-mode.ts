/**
 * Глобальный режим кабинета: «Прод» или «Тест». В отличие от прежнего подхода
 * (env-таб только у раздела Abkhaz Auto), режим теперь один на весь кабинет —
 * определяет, какой префикс S3-ключей (promos.json/queues.json/queue-*.json)
 * читает и пишет ЛЮБАЯ страница/роут. Хранится в httpOnly-куке `cab_env`,
 * читается ТОЛЬКО с сервера (см. readEnvMode) — клиент не может подделать
 * режим записи, отправив другое значение в теле запроса.
 */
export type EnvMode = 'prod' | 'test';

export const ENV_MODE_COOKIE = 'cab_env';

/** Cookie-хранилище с методом `.get`, достаточным нам подмножеством API
 *  как next/headers `cookies()`, так и `NextRequest['cookies']`. */
interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/** Дефолт — 'prod': текущие данные в бакете живут без префикса, поэтому
 *  отсутствие куки (первый визит, старая сессия) не должно менять поведение. */
export function readEnvMode(cookies: CookieReader): EnvMode {
  const raw = cookies.get(ENV_MODE_COOKIE)?.value;
  return raw === 'test' ? 'test' : 'prod';
}
