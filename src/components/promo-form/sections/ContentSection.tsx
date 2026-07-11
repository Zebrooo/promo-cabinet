'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { InlineContent } from '../content/InlineContent';
import { ToplineContent } from '../content/ToplineContent';
import { OverlayContent } from '../content/OverlayContent';
import { TooltipContent } from '../content/TooltipContent';
import { MultistepContent } from '../content/MultistepContent';
import { DivkitContent } from '../content/DivkitContent';
import { CustomContent } from '../content/CustomContent';
import { FieldError } from '../fields';

const TITLE_MAX = 60;

/** Title field — shown for every format except custom (title дериватится из
 *  label варианта в toPersisted, юзер его не заполняет). */
function TitleField() {
  const { values, handleChange, handleBlur } = useFormikContext<Promo>();
  const titleLen = values.title?.length ?? 0;
  const titleOver = titleLen > TITLE_MAX;
  return (
    <section className="ef-block">
      <div className="ef-label-row">
        <div className="ef-label">ЗАГОЛОВОК</div>
        <div className={`ef-counter mono${titleOver ? ' over' : ''}`}>{titleLen} / {TITLE_MAX}</div>
      </div>
      <input
        className="ef-input title"
        name="title"
        value={values.title ?? ''}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Что увидит пользователь"
        maxLength={TITLE_MAX + 20}
      />
      <FieldError name="title" />
    </section>
  );
}

/** Switches on values.format → the matching content/<Format>Content. The
 *  visibility of every field within is driven by CONTENT_KEYS_BY_FORMAT
 *  (schema.ts) — this switch is just the dispatcher, not the source of
 *  truth for which fields exist per format. */
export function ContentSection() {
  const { values } = useFormikContext<Promo>();
  return (
    <>
      {values.format !== 'custom' && <TitleField />}
      {values.format === 'inline' && <InlineContent />}
      {values.format === 'topline' && <ToplineContent />}
      {(values.format === 'popup' || values.format === 'fullscreen') && <OverlayContent />}
      {values.format === 'tooltip' && <TooltipContent />}
      {values.format === 'multistep' && <MultistepContent />}
      {values.format === 'divkit' && <DivkitContent />}
      {values.format === 'custom' && <CustomContent />}
    </>
  );
}
