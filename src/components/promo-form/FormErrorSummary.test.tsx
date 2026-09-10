import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Formik } from 'formik';
import { FormErrorSummary } from './FormErrorSummary';
import { FieldError } from './fields';

function render(node: ReactNode, opts: { errors?: object; touched?: object } = {}) {
  return renderToStaticMarkup(
    <Formik initialValues={{}} initialErrors={opts.errors ?? {}} initialTouched={opts.touched ?? {}} onSubmit={() => {}}>
      {node}
    </Formik>,
  );
}

describe('FormErrorSummary', () => {
  it('до сабмита ничего не показывает, после — список полей с подписями и сообщениями', () => {
    const errors = { action: { href: 'Укажите ссылку' }, steps: [undefined, { title: 'Пусто' }] };
    expect(render(<FormErrorSummary active={false} />, { errors })).toBe('');
    const html = render(<FormErrorSummary active />, { errors });
    expect(html).toContain('ошибок: 2');
    expect(html).toContain('Ссылка кнопки (CTA)');
    expect(html).toContain('Укажите ссылку');
    expect(html).toContain('Шаг 2 — заголовок');
    expect(html).toContain('role="alert"');
  });

  it('без ошибок панель пустая, extra-ошибки (из toPersisted) добавляются без дублей', () => {
    expect(render(<FormErrorSummary active />)).toBe('');
    const html = render(
      <FormErrorSummary active extra={[{ path: 'endsAt', label: 'Окончание показа', message: 'Раньше начала' }, { path: 'title', label: 'Заголовок', message: 'дубль' }]} />,
      { errors: { title: 'Укажите заголовок' } },
    );
    expect(html).toContain('ошибок: 2');
    expect(html).toContain('Раньше начала');
    expect(html).not.toContain('дубль');
  });
});

describe('FieldError', () => {
  it('рендерит якорь data-field-error для скролла из сводки, только когда поле touched', () => {
    const errors = { action: { href: 'Укажите ссылку' } };
    expect(render(<FieldError name="action.href" />, { errors })).toBe('');
    const html = render(<FieldError name="action.href" />, { errors, touched: { action: { href: true } } });
    expect(html).toContain('data-field-error="action.href"');
    expect(html).toContain('Укажите ссылку');
  });
});
