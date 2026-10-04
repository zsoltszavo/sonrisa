import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { session } from '@/lib/session';
import { LoginPage } from '@/routes/LoginPage';
import { mockApi } from '@/test/render';
import { RedirectIfSignedIn, RequireAuth } from './RouteGuards';

function Where() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderApp(route: string) {
  const router = createMemoryRouter(
    [
      { element: <RedirectIfSignedIn />, children: [{ path: '/login', element: <LoginPage /> }] },
      { element: <RequireAuth />, children: [{ path: '*', element: <Where /> }] },
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

const USER = { id: 'u1', email: 'alice@demo.test', role: 'user' };

afterEach(() => {
  session.signOut();
  vi.unstubAllGlobals();
});

describe('route guards', () => {
  it('sends a signed-out visitor to sign in, then back to the deep link with its query', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /api/auth/login': () => ({ body: { accessToken: 'token-1', user: USER } }),
      'GET /api/me': () => ({ body: USER }),
    });
    renderApp('/rules/abc?from=email');

    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'alice@demo.test');
    await user.type(screen.getByLabelText('Password'), 'sonrisa-alice-demo');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('location')).toHaveTextContent('/rules/abc?from=email');
    expect(session.getToken()).toBe('token-1');
  });

  it('shows the server message when sign-in fails', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /api/auth/login': () => ({
        status: 401,
        body: { message: 'Invalid email or password' },
      }),
    });
    renderApp('/login');

    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'alice@demo.test');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
