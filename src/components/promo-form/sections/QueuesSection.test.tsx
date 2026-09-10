// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueuesSection } from './QueuesSection';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const render = (queueNames: string[], membership: string[]) =>
  renderToStaticMarkup(
    <QueuesSection mode="edit" promoId="p1" queueNames={queueNames} membership={membership} />,
  );

describe('QueuesSection — очереди без потребителя', () => {
  it('помечает голую каталожную очередь как нечитаемую витриной, а per-device — нет', () => {
    const html = render(['transport', 'transport-web'], []);
    // Пометка стоит ровно у одной очереди из двух.
    expect(html.match(/не читается/g)).toHaveLength(1);
    expect(html).toContain('qchip-dead');
    expect(html).toContain('Витрина эту очередь не запрашивает');
  });

  it('предупреждает, когда промо стоит ТОЛЬКО в очередях без потребителя', () => {
    const html = render(['transport', 'transport-web'], ['transport']);
    expect(html).toContain('показов не будет');
    expect(html).toContain('суффиксом устройства');
  });

  it('молчит, когда есть хотя бы одна обслуживаемая очередь', () => {
    const html = render(['transport', 'transport-web'], ['transport', 'transport-web']);
    expect(html).not.toContain('показов не будет');
  });

  it('молчит, когда промо не стоит ни в одной очереди (для этого есть флаг noQueue в списке)', () => {
    expect(render(['transport'], [])).not.toContain('показов не будет');
  });
});
