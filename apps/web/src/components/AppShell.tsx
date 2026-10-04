import { LogOut } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { useCurrentUser, useSignOut } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { HealthBadge } from './HealthBadge';
import { Button } from './ui/button';
import { Toaster } from './ui/sonner';
import { Wordmark } from './Wordmark';

const NAV = [
  { to: '/notifications', label: 'My notifications', short: 'Notifications' },
  { to: '/rules', label: 'Alert rules', short: 'Rules' },
  { to: '/destinations', label: 'Destinations', short: 'Destinations' },
];
/** Shown to admins only; the server enforces the role on every /api/admin call. */
const ADMIN_NAV = { to: '/admin', label: 'Admin', short: 'Admin' };

/**
 * Layout after sign-in. The header copies sonrisa.hu's: a mist bar, the lockup on the left with
 * the site's 22/29px padding, navigation in the display face, and a 30px side gutter.
 */
export function AppShell() {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();
  const nav = user?.role === 'admin' ? [...NAV, ADMIN_NAV] : NAV;
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only z-50 bg-forest px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="bg-mist">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3 px-[15px] pt-4 pb-3 md:px-[30px] lg:pt-[22px] lg:pb-[29px]">
          <Link to="/notifications" aria-label="sonrisa world event alerts, home">
            <Wordmark />
          </Link>
          <nav
            aria-label="Main"
            className="order-last -mx-[15px] w-[calc(100%+30px)] overflow-x-auto md:order-none md:mx-0 md:w-auto"
          >
            <ul className="flex gap-1 px-[15px] md:px-0">
              {nav.map(({ to, label, short }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'block border-b-[3px] px-3 py-2 font-heading text-[14px] whitespace-nowrap text-forest md:text-[15px]',
                        isActive ? 'border-mint' : 'border-transparent hover:border-forest/30',
                      )
                    }
                  >
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm sm:inline" title="Signed in as">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 px-[15px] py-10 outline-none md:px-[30px] md:py-14"
      >
        <Outlet />
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-[15px] py-5 text-sm text-muted-foreground md:px-[30px]">
        <span>Alerts from USGS, GDACS and simulated sources.</span>
        <HealthBadge />
      </footer>
      <Toaster position="bottom-right" />
    </div>
  );
}

/** sonrisa.hu's 932px page wrapper; wide pages (the rule editor) opt into more room. */
export function PageWidth({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full', wide ? 'max-w-[1200px]' : 'max-w-[932px]')}>
      {children}
    </div>
  );
}
