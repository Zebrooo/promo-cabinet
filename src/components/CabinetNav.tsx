'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CabinetNav() {
  const path = usePathname();
  const onQueues = path.startsWith('/cabinet/queues');
  return (
    <nav className="nav">
      <Link href="/cabinet" className={`nav__tab ${onQueues ? '' : 'is-active'}`}>Список</Link>
      <Link href="/cabinet/queues" className={`nav__tab ${onQueues ? 'is-active' : ''}`}>Очереди</Link>
    </nav>
  );
}
