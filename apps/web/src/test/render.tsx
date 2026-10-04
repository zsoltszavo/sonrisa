import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

type Handler = (request: RecordedRequest) => { status?: number; body?: unknown } | undefined;

/**
 * Stubs `fetch` with a tiny API: handlers are keyed "METHOD /api/path". Unknown routes answer 404
 * so a test notices a request it didn't expect. Every request is recorded for assertions.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const request: RecordedRequest = {
        method: init?.method ?? 'GET',
        path: url.pathname,
        search: url.search,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      };
      requests.push(request);
      const handler = handlers[`${request.method} ${request.path}`];
      const answer = handler
        ? (handler(request) ?? {})
        : { status: 404, body: { message: 'Not found' } };
      const status = answer.status ?? 200;
      return Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(answer.body ?? null), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
  return requests;
}

/** Renders `element` at `route` inside a memory router and a fresh QueryClient. */
export function renderAt(element: ReactElement, { path = '/', route = '/' } = {}) {
  // Any navigation away from `path` lands here, so tests can assert where the page sent the user.
  function CurrentPath() {
    return <p data-testid="location">{useLocation().pathname}</p>;
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', element: <CurrentPath /> },
    ],
    { initialEntries: [route] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}
