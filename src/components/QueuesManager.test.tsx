import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueuesManager } from './QueuesManager';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('QueuesManager queue metadata', () => {
  it('shows a fixed queue human label, storage name and placement hint', () => {
    const html = renderToStaticMarkup(
      <QueuesManager initial={[{ name: 'persistent-inline', persist: true }]} />,
    );

    expect(html).toContain('Персистентный inline');
    expect(html).toContain('persistent-inline');
    expect(html).toContain('Постоянный inline-слот витрины');
  });

  it('falls back to the raw name for a queue without metadata', () => {
    const html = renderToStaticMarkup(
      <QueuesManager initial={[{ name: 'custom-queue', persist: false }]} />,
    );

    expect(html).toContain('custom-queue');
  });
});
