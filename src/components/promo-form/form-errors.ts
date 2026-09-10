/**
 * Сводка ошибок формы промо: FormikErrors (дерево строк с путями полей) →
 * плоский список «путь / человеческая подпись / сообщение». Её рисует липкая
 * панель под кнопкой «Сохранить» и по клику скроллит к полю. Чистый модуль —
 * без React, чтобы тестировался без jsdom.
 *
 * Зачем: validatePromoForm() давно возвращает ошибки с путями, но под
 * контролами они видны только там, где стоит <FieldError>, а панель писала
 * одну строку «Проверьте поля формы». Поле без FieldError (CTA-ссылка, шаг
 * визарда, картинка) было невозможно найти иначе, чем чтением исходников.
 */
import { setIn } from 'formik';
import type { ZodIssue } from 'zod';
import { FILTERS } from './targeting/registry';

export interface FormErrorItem {
  /** Formik-путь поля: 'action.href', 'steps.1.title', 'targeting.minAge'. */
  path: string;
  /** Подпись поля для человека. */
  label: string;
  message: string;
}

/** Дерево FormikErrors → плоский список путей с сообщениями (только строки;
 *  массивы — по индексам, как Formik их и хранит). Порядок — обход дерева,
 *  т.е. порядок полей в схеме. */
export function flattenFormErrors(tree: unknown, prefix = ''): { path: string; message: string }[] {
  if (tree === null || tree === undefined) return [];
  if (typeof tree === 'string') return tree && prefix ? [{ path: prefix, message: tree }] : [];
  if (typeof tree !== 'object') return [];
  return Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) =>
    flattenFormErrors(value, prefix ? `${prefix}.${key}` : key));
}

/** Подписи полей. Что не перечислено — берётся из карточки таргетинга
 *  (реестр фильтров) или показывается сырым путём. */
const FIELD_LABELS: Record<string, string> = {
  id: 'ID (slug)',
  name: 'Внутреннее название',
  title: 'Заголовок',
  startsAt: 'Начало показа',
  endsAt: 'Окончание показа',
  description: 'Описание',
  imageUrl: 'Картинка',
  backgroundImage: 'Фон-картинка',
  'backgroundGradient.from': 'Градиент фона — начало',
  'backgroundGradient.to': 'Градиент фона — конец',
  'backgroundGradient.angle': 'Градиент фона — угол',
  'action.href': 'Ссылка кнопки (CTA)',
  'action.label': 'Подпись кнопки (CTA)',
  leadPhone: 'Телефон для лидов',
  anchor: 'Якорь тултипа',
  variant: 'Вариант host-компонента',
  steps: 'Шаги визарда',
  presentation: 'Режим показа визарда',
  divkitUrl: 'DivKit URL',
  divkitJson: 'DivKit JSON',
  afterListings: 'Позиция в ленте',
  maxImpressionsPerUser: 'Лимит показов на пользователя',
  cooldownHours: 'Пауза между показами',
  afterPromoId: 'Показывать после промо',
  afterClickPromoId: 'Показывать после клика по промо',
  schedule: 'Расписание показов',
  lifecycle: 'Жизненный цикл продавца',
  sections: 'Разделы',
  categories: 'Категории',
  audience: 'Аудитория',
  sellerStatus: 'Продавцы и покупатели',
  deviceTarget: 'Устройства',
  format: 'Формат',
  referralActive: 'Реферальная программа активна',
  referralInviterCreditKopecks: 'Бонус приглашающему',
  referralSellerBonusKopecks: 'Бонус продавцу',
  referralDailyInviteCap: 'Дневной лимит приглашений',
  referralHoldHours: 'Задержка начисления',
  dailyBudgetKopecks: 'Дневной бюджет программы',
};

const STEP_FIELD_LABELS: Record<string, string> = { title: 'заголовок', body: 'текст', imageUrl: 'картинка' };

export function labelForPath(path: string): string {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  const step = /^steps\.(\d+)(?:\.(\w+))?$/.exec(path);
  if (step) {
    const n = Number(step[1]) + 1;
    return step[2] ? `Шаг ${n} — ${STEP_FIELD_LABELS[step[2]] ?? step[2]}` : `Шаг ${n}`;
  }
  // Поля таргетинга: подпись карточки фильтра, в которой живёт путь.
  const filter = FILTERS.find((f) => f.paths.some((own) => path === own || path.startsWith(`${own}.`)));
  if (filter) {
    const leaf = path.split('.').pop() ?? path;
    return filter.paths.length === 1 && filter.paths[0] === path ? filter.label : `${filter.label} — ${leaf}`;
  }
  return path;
}

export function summarizeFormErrors(errors: unknown): FormErrorItem[] {
  return flattenFormErrors(errors).map((e) => ({ ...e, label: labelForPath(e.path) }));
}

/** ZodError.issues → FormikErrors той же формы, что строит validatePromoForm
 *  (для ошибок, которые всплывают только в toPersisted: superRefine схемы
 *  союза, которых member-схемы формы не знают). */
export function zodIssuesToFormErrors<T extends object>(issues: readonly ZodIssue[]): Partial<Record<keyof T, unknown>> {
  let errors: object = {};
  for (const issue of issues) {
    const path = issue.path.join('.');
    errors = setIn(errors, path || 'id', issue.message);
  }
  return errors as Partial<Record<keyof T, unknown>>;
}
