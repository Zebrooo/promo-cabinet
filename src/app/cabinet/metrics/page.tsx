import { requireSession } from '@/lib/require-session';

// «Метрики» — хаб ссылок на внешние наблюдательные системы (решение
// 2026-07-28: админка = настройка промо + пульт деплоя + метрики). Именно
// ССЫЛКИ, не iframe: у Grafana свой логин, embed требует allow_embedding и
// возни с CSP, а ценности не добавляет. Новые системы — добавлять карточкой
// в TOOLS; заглушки (url: null) рендерятся выключенными, чтобы список
// отражал и то, что ещё в планах.
type Tool = {
  title: string;
  description: string;
  url: string | null; // null = ещё не поднято, карточка неактивна
  note?: string;
};

const TOOLS: Tool[] = [
  {
    title: 'Grafana · Abkhaz Auto (тест)',
    description:
      'Дашборд ads-promo: показы/клики/чекеры рекламной системы, трейс select-promo. Живёт на тест-сервере, свой логин Grafana.',
    url: 'https://aa-grafana-test.eremin.site',
  },
  {
    title: 'Grafana · Abkhaz Auto (прод)',
    description:
      'Прод-наблюдение витрины (monitoring/ из репо витрины: сервер, БД, платежи). Поднимается после прод-релиза с миграцией 0198.',
    url: null,
    note: 'ещё не поднята',
  },
  {
    title: 'Здоровье витрины (/admin/health)',
    description:
      'Витринная страница датчиков: кроны, диск, платежи, канарейка (canary-anon-read), балансы внешних сервисов.',
    url: 'https://m.abkhaz-auto.ru/admin/health',
    note: 'нужен вход витринным админом',
  },
];

export default function MetricsPage() {
  requireSession();
  return (
    <div>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">АДМИНКА</div>
          <h1>Метрики и аналитика</h1>
        </div>
      </div>
      <p className="metrics-intro">
        Внешние системы наблюдения — открываются в новой вкладке, у каждой своя
        авторизация.
      </p>
      <div className="metrics-grid">
        {TOOLS.map((t) =>
          t.url ? (
            <a
              key={t.title}
              className="metrics-card"
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="metrics-card-title">{t.title} ↗</div>
              <div className="metrics-card-desc">{t.description}</div>
              {t.note ? <div className="metrics-card-note">{t.note}</div> : null}
            </a>
          ) : (
            <div key={t.title} className="metrics-card is-disabled">
              <div className="metrics-card-title">{t.title}</div>
              <div className="metrics-card-desc">{t.description}</div>
              {t.note ? <div className="metrics-card-note">{t.note}</div> : null}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
