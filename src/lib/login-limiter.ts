/**
 * Защита /api/login от перебора. Один общий admin-аккаунт без второго фактора
 * означает, что единственный барьер — пароль, поэтому число неудачных попыток
 * надо ограничивать. Кабинет — один контейнер (docker compose, без реплик),
 * поэтому in-memory скользящего окна достаточно; при рестарте счётчики
 * обнуляются — это приемлемо, перебор с нуля всё равно упрётся в лимит.
 *
 * Два окна: по IP (основное) и глобальное (страховка от распределённого
 * перебора и от подделки X-Forwarded-For, если прокси его не чистит).
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILS_PER_IP = 8;
export const LOGIN_MAX_FAILS_GLOBAL = 100;

const GLOBAL_KEY = '*';
const fails = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (fails.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}

/** Сколько секунд ждать до следующей попытки; 0 = можно пробовать. */
export function loginRetryAfterSeconds(ip: string, now: number = Date.now()): number {
  const byIp = recent(ip, now);
  const global = recent(GLOBAL_KEY, now);
  const blockedBy =
    byIp.length >= LOGIN_MAX_FAILS_PER_IP ? byIp
    : global.length >= LOGIN_MAX_FAILS_GLOBAL ? global
    : null;
  if (!blockedBy) return 0;
  const oldest = Math.min(...blockedBy);
  return Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 1000));
}

export function recordLoginFailure(ip: string, now: number = Date.now()): void {
  fails.set(ip, [...recent(ip, now), now]);
  fails.set(GLOBAL_KEY, [...recent(GLOBAL_KEY, now), now]);
}

/** Успешный вход снимает блокировку с этого IP (глобальное окно не трогаем). */
export function recordLoginSuccess(ip: string): void {
  fails.delete(ip);
}

/** IP клиента за reverse-proxy: первый адрес из X-Forwarded-For, иначе X-Real-IP. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  return first || headers.get('x-real-ip')?.trim() || 'unknown';
}

export function resetLoginLimiterForTests(): void {
  fails.clear();
}
