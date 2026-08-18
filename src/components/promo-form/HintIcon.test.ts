// @vitest-environment jsdom
// Компонентный тест HintIcon (прецедент jsdom — src/lib/track-attrs.test.ts):
// вся ценность компонента — поведение открытия/закрытия попапа, это и фиксируем.
import { describe, expect, it, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HintIcon } from './HintIcon';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(text: string, label?: string): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(HintIcon, { text, label }));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const button = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button.hint-icon')!;

describe('HintIcon', () => {
  it('рендерит кнопку (i), текст подсказки скрыт до клика', () => {
    const el = render('Секретная подсказка');
    const btn = button(el);
    expect(btn).not.toBeNull();
    expect(btn.type).toBe('button'); // не сабмитит форму промо
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Подсказка');
    expect(el.textContent).not.toContain('Секретная подсказка');
  });

  it('клик открывает popover с текстом и ставит aria-expanded=true', () => {
    const el = render('Текст по клику', 'Что это значит');
    act(() => { button(el).click(); });
    expect(button(el).getAttribute('aria-expanded')).toBe('true');
    expect(button(el).getAttribute('aria-label')).toBe('Что это значит');
    const pop = el.querySelector('.hint-popover');
    expect(pop?.textContent).toContain('Текст по клику');
    expect(button(el).getAttribute('aria-controls')).toBe(pop?.id);
  });

  it('повторный клик закрывает popover', () => {
    const el = render('Текст');
    act(() => { button(el).click(); });
    act(() => { button(el).click(); });
    expect(button(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.hint-popover')).toBeNull();
  });

  it('клик вне компонента закрывает popover; клик внутри popover — нет', () => {
    const el = render('Текст');
    act(() => { button(el).click(); });
    // mousedown внутри самого popover не закрывает (можно выделить текст).
    act(() => {
      el.querySelector('.hint-popover')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(el.querySelector('.hint-popover')).not.toBeNull();
    // mousedown вне — закрывает.
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(el.querySelector('.hint-popover')).toBeNull();
    expect(button(el).getAttribute('aria-expanded')).toBe('false');
  });
});
