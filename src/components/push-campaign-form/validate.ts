// Per-field FormikErrors для формы пуш-рассылки — из zod-схемы
// (pushCampaignInputSchema) плюс кросс-полевые правила, общие с промо
// (расписание без дней, гость × жизненный цикл). Пути ошибок совпадают с
// путями фильтров таргетинга (targeting.*, lifecycle, schedule), поэтому
// TargetingSection раскрывает карточку с ошибкой так же, как у промо.
import type { FormikErrors } from 'formik';
import { setIn } from 'formik';
import { compactLifecycle } from '@/lib/lifecycle';
import { ADVERTISER_ANONYMOUS_MESSAGE } from '@/lib/schema';
import { hasAdvertiserCriteria } from '@/lib/targeting-normalize';
import { pushCampaignInputSchema, type PushCampaignFormValues } from '@/lib/push-campaign-schema';
import { toPushCampaignInput } from './to-persisted';

export function validatePushCampaignForm(rawValues: PushCampaignFormValues): FormikErrors<PushCampaignFormValues> {
  let errors: FormikErrors<PushCampaignFormValues> = {};

  // Очищенные lifecycle-контролы (ключи-undefined / пустой {}) означают
  // «гейта нет» — refine схемы «пустой блок» не должен краснить форму.
  const values = compactLifecycle(rawValues);

  const result = pushCampaignInputSchema.safeParse(toPushCampaignInput(values, { strict: false }));
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors = setIn(errors, issue.path.join('.'), issue.message);
    }
  }

  // Страховка UI-инварианта «нельзя снять последний день» (как у промо).
  if (values.schedule && values.schedule.daysOfWeek.length === 0) {
    errors = setIn(errors, 'schedule.daysOfWeek', 'Выберите хотя бы один день');
  }

  // anonymous × lifecycle — условия по объявлениям у гостя никогда не совпадут.
  if (values.audience === 'anonymous' && values.lifecycle !== undefined) {
    errors = setIn(errors, 'lifecycle',
      'Условия по объявлениям никогда не совпадут у гостя — уберите блок жизненного цикла или смените аудиторию');
  }

  // anonymous × рекламодатель — кампании и мастер подачи есть только у аккаунта.
  if (values.audience === 'anonymous' && hasAdvertiserCriteria(values.targeting?.advertiser)) {
    errors = setIn(errors, 'targeting.advertiser', ADVERTISER_ANONYMOUS_MESSAGE);
  }

  return errors;
}
