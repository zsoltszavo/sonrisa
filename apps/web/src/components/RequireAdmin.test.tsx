import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { session } from '@/lib/session';
import { mockApi } from '@/test/render';
import { AppShell } from './AppShell';
import { RequireAdmin, RequireAuth } from './RouteGuards';

function Where() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderApp(route: string) {
  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                element: <RequireAdmin />,
                children: [{ path: '/admin/*', element: <p>Admin tools</p> }],
              },
              { path: '*', element: <Where /> },
            ],
          },
        ],
      },
    ],
    { initialEntries: [route] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const asRole = (role: 'user' | 'admin') => {
  session.signIn('token-1');
  mockApi({
    'GET /api/me': () => ({ body: { id: 'u1', email: `${role}@demo.test`, role } }),
    'GET /api/health': () => ({ body: { status: 'ok', database: 'up' } }),
  });
};

afterEach(() => {
  session.signOut();
  vi.unstubAllGlobals();
});

describe('Admin area (UX only; the server answers 403)', () => {
  it('shows the Admin nav item and the admin route to an admin', async () => {
    asRole('admin');
    renderApp('/admin/events');
    expect(await screen.findByText('Admin tools')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin');
  });

  it('sends a non-admin away from an admin deep link and hides the Admin nav item', async () => {
    asRole('user');
    renderApp('/admin/events');
    expect(await screen.findByTestId('location')).toHaveTextContent('/notifications');
    expect(screen.queryByText('Admin tools')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
  });
});
