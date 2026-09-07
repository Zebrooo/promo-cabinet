// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PushCampaignsPanel } from './PushCampaignsPanel';

const css = readFileSync('src/app/globals.css', 'utf8');
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PushCampaignsPanel', () => {
  it('renders the guarded three-step campaign workflow', () => {
    const html = renderToStaticMarkup(<PushCampaignsPanel env="prod" />);
    expect(html).toContain('Push‑рассылки');
    expect(html).toContain('01 · СООБЩЕНИЕ');
    expect(html).toContain('Рассчитать аудиторию');
    expect(html).toContain('Отправка на этом шаге не начнётся');
    expect(html).toContain('03 · ЖУРНАЛ');
  });

  it('shows a live notification preview and safe audience choices', () => {
    const html = renderToStaticMarkup(<PushCampaignsPanel env="test" />);
    expect(html).toContain('Предпросмотр push-уведомления');
    expect(html).toContain('Согласие в приложении');
    expect(html).toContain('Учесть офлайн‑согласие');
    expect(html).toContain('никогда — явно отказавшихся');
    expect(html).toContain('/zapros');
  });

  it('keeps one accessible preview before the form and pins both environment badges in the DOM', () => {
    const prodHtml = renderToStaticMarkup(<PushCampaignsPanel env="prod" />);
    const testHtml = renderToStaticMarkup(<PushCampaignsPanel env="test" />);

    expect(prodHtml.match(/aria-label="Предпросмотр push-уведомления"/g)).toHaveLength(1);
    expect(prodHtml.indexOf('class="push-preview-column"')).toBeLessThan(prodHtml.indexOf('class="form-panel push-compose"'));
    expect(prodHtml).toContain('push-env-chip push-env-prod">ПРОД');
    expect(testHtml).toContain('push-env-chip push-env-test">ТЕСТ');
  });

  it('defines compact mobile preview, 44px touch targets, wrapping and visible focus', () => {
    expect(css).toMatch(/\.push-compose \{ grid-column: 1; grid-row: 1;/);
    expect(css).toMatch(/\.push-preview-column \{[\s\S]*?grid-column: 2; grid-row: 1;/);
    expect(css).toMatch(/@media \(max-width: 720px\), \(pointer: coarse\) \{[\s\S]*?\.env-switch-tab \{ min-width: 44px; height: 44px;/);
    expect(css).toMatch(/@media \(max-width: 720px\), \(pointer: coarse\) \{[\s\S]*?\.topstrip-logout \{ width: 44px; height: 44px;/);
    expect(css).toMatch(/\.push-page \.input, \.push-page \.select \{ min-height: 44px; height: 44px;/);
    expect(css).toContain('.push-choice:has(input:focus-visible)');
    expect(css).toContain('.push-page-header .left h1 { flex-wrap: wrap;');
    expect(css).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.push-phone-top \{ display: none; \}/);
  });

  it('keeps delivery choices operable with touch-style label activation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      campaigns: [],
      worker: { enabled: false, healthy: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<PushCampaignsPanel env="test" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const delivery = host.querySelectorAll<HTMLInputElement>('input[name="delivery"]');
    expect(delivery).toHaveLength(2);
    expect(host.querySelector('#push-schedule')).toBeNull();

    await act(async () => delivery[1]?.click());

    expect(delivery[1]?.checked).toBe(true);
    expect(host.querySelector('#push-schedule')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/push/campaigns', expect.objectContaining({ cache: 'no-store' }));

    await act(async () => root.unmount());
    host.remove();
    fetchMock.mockRestore();
  });
});
