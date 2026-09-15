// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { Formik } from 'formik';
import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import { FrequencySection } from './FrequencySection';

const base: Promo = {
  id: 'p1', name: 'P', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, format: 'popup', title: 'T', audience: 'all', deviceTarget: 'both',
};
const pool = [{ id: 'p1', title: 'T' }, { id: 'other', title: 'O' }];
const render = (values: Promo) =>
  renderToStaticMarkup(
    <Formik initialValues={values} onSubmit={() => {}}>
      <FrequencySection poolPromos={pool} />
    </Formik>,
  );

describe('FrequencySection — паузы', () => {
  it('поле общей паузы в минутах с пересчётом в часы и кнопка добавления правила', () => {
    const html = render({ ...base, cooldownSelfMinutes: 180 });
    expect(html).toContain('Пауза для формата после показа, минут');
    expect(html).toContain('= 3 ч');
    expect(html).toContain('Добавить правило');
    expect(html).not.toContain('Кулдаун (часов)');
  });

  it('правила выводятся строками с id и минутами; datalist включает само промо', () => {
    const html = render({ ...base, cooldownPromos: [{ promoId: 'p1', minutes: 3 }] });
    expect(html).toContain('value="p1"');
    expect(html).toContain('value="3"');
    expect(html).toContain('id="cooldown-promo-ids"');
    expect(html).toContain('p1 — T');
  });

  it('устаревший cooldownHours показывает подсказку и не редактируется; с новыми полями подсказки нет', () => {
    const legacy = render({ ...base, cooldownHours: 5 });
    expect(legacy).toContain('Устаревший кулдаун 5 ч');
    expect(legacy).toContain('300 мин');
    expect(render({ ...base, cooldownHours: 5, cooldownSelfMinutes: 10 })).not.toContain('Устаревший кулдаун');
    expect(render({ ...base, cooldownHours: 0 })).not.toContain('Устаревший кулдаун');
  });

  it('предупреждает, если id правила паузы не входит в пул', () => {
    const html = render({ ...base, cooldownPromos: [{ promoId: 'nope', minutes: 5 }] });
    expect(html).toContain('Промо с таким id нет в пуле — правило паузы не сработает.');
  });

  it('не предупреждает, если id правила есть в пуле', () => {
    const html = render({ ...base, cooldownPromos: [{ promoId: 'other', minutes: 5 }] });
    expect(html).not.toContain('правило паузы не сработает');
  });

  it('не предупреждает про ссылку на себя, даже если своего id ещё нет в пуле', () => {
    const html = render({ ...base, id: 'new-promo', cooldownPromos: [{ promoId: 'new-promo', minutes: 5 }] });
    expect(html).not.toContain('правило паузы не сработает');
  });
});
