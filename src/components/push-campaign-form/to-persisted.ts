// Состояние формы пуш-рассылки → тело POST /api/push-campaigns. Та же
// нормализация таргетинга, что у промо (lib/targeting-normalize.ts,
// compactLifecycle, «полное покрытие расписания = поля нет»), плюс свои
// мелочи: пустая иконка/пустые списки не пишутся, audience 'all' = поля нет.
import { compactLifecycle } from '@/lib/lifecycle';
import { normalizeTargeting } from '@/lib/targeting-normalize';
import { pushCampaignInputSchema, type PushCampaignFormValues, type PushCampaignInput } from '@/lib/push-campaign-schema';
import { isFullCoverage } from '@/components/promo-form/schedule-presets';

/** Нормализованный вход БЕЗ zod-проверки (для validate) или с ней (для
 *  сабмита — тогда бросает ZodError на невалидных данных). */
export function toPushCampaignInput(
  rawValues: PushCampaignFormValues,
  opts: { strict: boolean } = { strict: true },
): PushCampaignInput {
  const values = compactLifecycle(rawValues);
  const icon = values.icon.trim();
  const draft: PushCampaignInput = {
    ...(values.id ? { id: values.id } : {}),
    title: values.title,
    body: values.body,
    url: values.url,
    ...(icon ? { icon } : {}),
    targeting: normalizeTargeting(values.targeting ?? {}),
    ...(values.audience && values.audience !== 'all' ? { audience: values.audience } : {}),
    ...(values.sellerStatus ? { sellerStatus: values.sellerStatus } : {}),
    ...(values.sections?.length ? { sections: values.sections } : {}),
    ...(values.categories?.length ? { categories: values.categories } : {}),
    ...(values.schedule && !isFullCoverage(values.schedule) ? { schedule: values.schedule } : {}),
    ...(values.lifecycle ? { lifecycle: values.lifecycle } : {}),
  };
  return opts.strict ? pushCampaignInputSchema.parse(draft) : draft;
}
