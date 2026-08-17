// Опции и хинты блока «Среда и устройство» (спека targeting-device-env §2).
// Конвенция та же, что у subscriptionLevels: пусто = показывать всем;
// OR внутри группы, AND между группами (как все правила таргетинга).

/** Клик по чекбоксу группы: добавить/убрать значение; пустой набор → undefined. */
export function toggleEnumValue<T extends string>(
  cur: readonly T[] | undefined,
  value: T,
  checked: boolean,
): T[] | undefined {
  const without = (cur ?? []).filter((x) => x !== value);
  const next = checked ? [...without, value] : without;
  return next.length ? next : undefined;
}

export const OS_OPTIONS = [
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
] as const;

export const ENVIRONMENT_OPTIONS = [
  { value: 'browser', label: 'Браузер' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'pwa', label: 'PWA' },
  { value: 'app', label: 'Приложение' },
] as const;

export const DEVICE_BRAND_OPTIONS = [
  { value: 'iphone', label: 'iPhone' },
  { value: 'android-flagship', label: 'Android-флагман' },
  { value: 'android-other', label: 'Остальной Android' },
] as const;

export const OS_HINT =
  'Пусто — любая ОС. Десктоп не имеет ОС-класса: при отмеченных пунктах промо на десктопе не показывается.';
export const ENVIRONMENT_HINT =
  'Telegram/PWA распознаются со второй страницы визита; первая страница засчитывается как «браузер не определён» и промо не получает.';
export const DEVICE_BRAND_HINT =
  'Прокси платёжеспособности по User-Agent. Современный Chrome на Android часто скрывает модель — такие попадают в «остальной Android» либо не распознаются вовсе (промо не показывается). iPhone неделим: SE и Pro Max выглядят одинаково.';
