import { Activity, Database, List, Maximize2, Ruler } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { Link, NavLink, useLocation, type NavLinkRenderProps } from 'react-router-dom';
import { cn } from '../lib/utils';

const navigation = [
  { to: '/', label: 'Activity', icon: Activity, end: true },
  { to: '/events', label: 'Events', icon: List, end: false },
  { to: '/kiosk', label: 'Kiosk', icon: Maximize2, end: false },
  { to: '/event-types', label: 'Event types', icon: Database, end: false },
  { to: '/units', label: 'Units', icon: Ruler, end: false }
] as const;

export function Layout({ children }: PropsWithChildren) {
  const location = useLocation();
  const isKiosk = location.pathname === '/kiosk';

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark"><Activity className="size-5" /></span>
          <span>Home Logbook</span>
        </Link>
        <nav className="topnav" aria-label="Main navigation">
          {navigation.map((item: (typeof navigation)[number]) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }: NavLinkRenderProps) => cn(isActive && 'active')}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </header>
      <main className={cn('page', isKiosk && 'page-kiosk')}>{children}</main>
    </div>
  );
}
