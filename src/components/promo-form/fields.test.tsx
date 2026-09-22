// @vitest-environment jsdom
// Регресс: чекбокс на useField({ type: 'checkbox' }) со спредом {...field}
// не имеет атрибута value. При клиентском рендере React сам ставит DOM-value
// в "" (пустая строка → formik отдаёт boolean), но на проде форма приходит с
// SSR: при гидрации React DOM-значение не трогает, у чекбокса остаётся
// браузерный дефолт value="on", и formik-овский getValueForCheckbox уходит в
// семантику группы чекбоксов — значение становится массивом (["on"] ↔ []),
// схема падает на «dismissible — Expected boolean, received array», и
// повторные клики состояние не лечат.
import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Formik } from 'formik';
import { CheckboxField } from './fields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = undefined;
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

function checkboxAt(initialValues: object) {
  let latest: Record<string, unknown> = {};
  return {
    node: (
      <Formik initialValues={initialValues} onSubmit={() => {}}>
        {({ values }) => {
          latest = values as Record<string, unknown>;
          return <CheckboxField name="dismissible" label="Можно закрыть" />;
        }}
      </Formik>
    ),
    values: () => latest,
  };
}

/** Клиентский рендер с нуля (createRoot). */
function renderClient(initialValues: object) {
  const { node, values } = checkboxAt(initialValues);
  act(() => {
    root = createRoot(container);
    root.render(node);
  });
  const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
  return { input, values };
}

/** Прод-сценарий Next.js app router: SSR-разметка + hydrateRoot. Бандленный
 *  в Next React-canary (линейка React 19) при гидрации не трогает DOM-value
 *  инпутов, поэтому чекбокс без атрибута value остаётся с браузерным
 *  дефолтом value="on" — formik-у в handleChange прилетает valueProp "on", и
 *  он копит массив. Наш тестовый react-dom 18.3.1 при гидрации пишет
 *  value="" — снимаем атрибут, чтобы DOM выглядел как на проде. */
function renderHydrated(initialValues: object) {
  const { node, values } = checkboxAt(initialValues);
  // renderToString в jsdom-среде заставляет formik-овский
  // useIsomorphicLayoutEffect ругаться «useLayoutEffect does nothing on the
  // server» — к делу не относится, глушим только это предупреждение.
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) return;
    origError(...args);
  };
  try {
    container.innerHTML = renderToString(node);
  } finally {
    console.error = origError;
  }
  act(() => {
    root = hydrateRoot(container, node);
  });
  const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
  input.removeAttribute('value');
  return { input, values };
}

/** async act: после клика formik гоняет валидацию промисом — даём ей
 *  дорезолвиться внутри act, иначе React ругается на setState вне act. */
async function click(input: HTMLInputElement) {
  await act(async () => input.click());
}

describe('CheckboxField', () => {
  it('после SSR-гидрации клик даёт boolean true, а не массив (прод-баг)', async () => {
    const { input, values } = renderHydrated({});
    expect(input.checked).toBe(false);
    await click(input);
    expect(values().dismissible).toBe(true);
    expect(input.checked).toBe(true);
    await click(input);
    expect(values().dismissible).toBe(false);
    expect(input.checked).toBe(false);
  });

  it('клиентский рендер: клик при отсутствующем начальном значении даёт boolean', async () => {
    const { input, values } = renderClient({});
    await click(input);
    expect(values().dismissible).toBe(true);
    await click(input);
    expect(values().dismissible).toBe(false);
  });

  it('boolean-начальное значение переключается как boolean', async () => {
    const { input, values } = renderClient({ dismissible: true });
    expect(input.checked).toBe(true);
    await click(input);
    expect(values().dismissible).toBe(false);
    await click(input);
    expect(values().dismissible).toBe(true);
  });

  it('лечит уже испорченное массивом состояние: рисуется unchecked, клик даёт boolean', async () => {
    // Так выглядит форма после бага на проде: значение застряло массивом.
    const { input, values } = renderClient({ dismissible: ['on'] });
    expect(input.checked).toBe(false);
    await click(input);
    expect(values().dismissible).toBe(true);
  });
});
