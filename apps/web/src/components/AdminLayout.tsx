import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';

const ADMIN_NAV = [
  { to: '/admin/sources', label: 'Event Sources' },
  { to: '/admin/simulator', label: 'Simulator' },
  { to: '/admin/events', label: 'Event explorer' },
  { to: '/admin/notifications', label: 'Notification log' },
];

/**
 * The Admin area's second navigation row: the four admin tools (D10). It sits on the page like
 * the main nav sits in the header, with the same mint underline for the current tool.
 */
export function AdminLayout() {
  return (
    <>
      <nav
        aria-label="Admin"
        className="mx-auto mb-10 w-full max-w-[1200px] border-b border-border"
      >
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          <li className="flex items-center pr-3">
            <span className="flex items-center gap-2 font-heading text-[13px] text-muted-foreground">
              <span className="size-2.5 bg-lime" aria-hidden="true" />
              Admin
            </span>
          </li>
          {ADMIN_NAV.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'block border-b-[3px] px-3 py-2.5 font-heading text-[14px] whitespace-nowrap text-forest',
                    isActive ? 'border-mint' : 'border-transparent hover:border-forest/30',
                  )
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
