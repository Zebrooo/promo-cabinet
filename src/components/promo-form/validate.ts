// Replaces the old hand-rolled clientValidate() — a single string message —
// with per-field FormikErrors, built from the active format's zod schema
// (SCHEMA_BY_FORMAT) plus the cross-field rules that live outside any single
// member schema (dates, afterPromoId, divkit-required-on-the-form).
import type { FormikErrors } from 'formik';
import { setIn } from 'formik';
import { SCHEMA_BY_FORMAT, type Promo } from '@/lib/schema';
import { compactLifecycle } from '@/lib/lifecycle';

export function validatePromoForm(rawValues: Promo): FormikErrors<Promo> {
  let errors: FormikErrors<Promo> = {};

  // Очищенные lifecycle-контролы (ключи-undefined / пустой {}) означают
  // «гейта нет» — refine схемы «пустой блок» не должен краснить форму.
  const values = compactLifecycle(rawValues);

  const schema = SCHEMA_BY_FORMAT[values.format];
  const result = schema.safeParse(values);
  if (!result.success) {
    for (const issue of result.error.issues) {
      // custom-формат: title дериватится из label варианта в toPersisted() —
      // юзер его не заполняет, поэтому не показываем zod's "укажите
      // заголовок" на пустом title-поле (которого в UI для custom нет).
      if (values.format === 'custom' && issue.path.join('.') === 'title') continue;
      errors = setIn(errors, issue.path.join('.'), issue.message);
    }
  }

  // Даты — кросс-полевая проверка, живёт в promoSchema.superRefine(), а не в
  // отдельных member-схемах SCHEMA_BY_FORMAT, поэтому дублируем здесь.
  if (values.startsAt && values.endsAt &&
      new Date(values.startsAt).getTime() >= new Date(values.endsAt).getTime()) {
    errors = setIn(errors, 'endsAt', 'Дата начала должна быть раньше даты окончания');
  }

  // Страховка UI-инварианта «нельзя снять последний день»: чип последнего
  // дня в ScheduleSection задизейблен, но битый initial-state мог прийти
  // извне — дублируем сообщение схемы явно (спека targeting-schedule §2.1).
  if (values.schedule && values.schedule.daysOfWeek.length === 0) {
    errors = setIn(errors, 'schedule.daysOfWeek', 'Выберите хотя бы один день');
  }

  // anonymous × lifecycle — кросс-полевое правило из promoSchema.superRefine();
  // member-схемы SCHEMA_BY_FORMAT его не знают, поэтому дублируем, как даты.
  if (values.audience === 'anonymous' && values.lifecycle !== undefined) {
    errors = setIn(errors, 'lifecycle',
      'Условия по объявлениям никогда не совпадут у гостя — уберите блок жизненного цикла или смените аудиторию');
  }

  // afterPromoId !== id — та же кросс-полевая проверка, что в superRefine().
  if (values.afterPromoId && values.afterPromoId.trim() === values.id.trim()) {
    errors = setIn(errors, 'afterPromoId', 'Промо не может показываться после самого себя — укажите id другого промо');
  }

  // afterClickPromoId !== id — зеркало той же проверки для цепочки по клику.
  if (values.afterClickPromoId && values.afterClickPromoId.trim() === values.id.trim()) {
    errors = setIn(errors, 'afterClickPromoId', 'Промо не может показываться после клика по самому себе — укажите id другого промо');
  }

  // Сбор лидов без номера доставки бессмыслен: заявка сохранится, но улетать
  // ей некуда — рекламодатель узнает о ней из отчёта через день. Правило
  // кросс-полевое (зависит от leadCapture), поэтому живёт здесь, а не в схеме.
  if (values.leadCapture === true && !values.leadPhone) {
    errors = setIn(errors, 'leadPhone', 'Укажите номер: на него уйдёт заявка сразу после нажатия');
  }

  // DivKit: обязательность JSON/URL — правило формы (юзер должен либо
  // вставить JSON, либо уже иметь загруженный URL), а не хранимой схемы
  // (divkitUrl/divkitJson оба optional в divkitPromoSchema — divkitJson
  // вообще транзитное preview-only поле, которого в сторадж-контракте нет).
  if (values.format === 'divkit' && !values.divkitUrl && !values.divkitJson) {
    errors = setIn(errors, 'divkitJson', 'Вставьте DivKit JSON или загрузите готовый URL');
  }

  return errors;
}
