import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

function renderHomePage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>,
  );
}

function stubHealthEndpoint(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status }))),
  );
}

describe('HomePage API status', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows "Database up" when the API reports a healthy database', async () => {
    stubHealthEndpoint(200, JSON.stringify({ status: 'ok', database: 'up' }));
    renderHomePage();
    expect(await screen.findByText('Database up')).toBeInTheDocument();
  });

  it('shows "Database down" on a 503 with a valid body', async () => {
    stubHealthEndpoint(503, JSON.stringify({ status: 'error', database: 'down' }));
    renderHomePage();
    expect(await screen.findByText('Database down')).toBeInTheDocument();
  });

  it('shows "API unreachable" on a non-JSON proxy error page', async () => {
    stubHealthEndpoint(502, '<html>Bad Gateway</html>');
    renderHomePage();
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });

  it('shows "API unreachable" when a 503 body is not a health payload', async () => {
    stubHealthEndpoint(503, '<html>Service Unavailable</html>');
    renderHomePage();
    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });
});
