import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/CabinetShell';
import { AutoClickTracker } from '@/components/AutoClickTracker';
import { CabinetPageView } from '@/components/CabinetPageView';

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return (
    <CabinetShell>
      <AutoClickTracker />
      <CabinetPageView />
      {children}
    </CabinetShell>
  );
}
