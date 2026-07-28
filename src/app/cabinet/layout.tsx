import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/CabinetShell';
import { AutoClickTracker } from '@/components/AutoClickTracker';
import { CabinetPageView } from '@/components/CabinetPageView';
import { readEnvMode } from '@/lib/env-mode';

// Layout — серверный компонент: читает режим из куки ОДИН раз для всего
// кабинета и прокидывает его вниз пропом (CabinetShell → EnvSwitch/EnvBanner,
// страницы читают ту же куку сами при своём собственном рендере). Без
// dynamic='force-dynamic' здесь: страницы внутри уже force-dynamic, а сам
// layout не делает S3-чтений — только cookies(), что уже само по себе opt-out
// из статического рендера.
export default function CabinetLayout({ children }: { children: ReactNode }) {
  const env = readEnvMode(cookies());
  return (
    <CabinetShell env={env}>
      <AutoClickTracker />
      <CabinetPageView />
      {children}
    </CabinetShell>
  );
}
