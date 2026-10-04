import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '@/test/render';
import { NotificationLogPage } from './NotificationLogPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const failed = {
  id: 'n1',
  kind: 'match',
  status: 'failed',
  severity: 4,
  attempts: 3,
  lastError: 'Slack webhook answered 404 no_service',
  createdAt: '2026-10-04T10:00:00.000Z',
  sentAt: null,
  user: { id: 'u1', email: 'alice@demo.test' },
  event: {
    id: 'e1',
    title: 'Cyclone Mira makes landfall',
    source: 'simulated',
    category: 'disaster',
  },
  destination: null,
};

describe('NotificationLogPage', () => {
  it('filters failed Notifications, shows the error and retries one', async () => {
    const user = userEvent.setup();
    let status = 'failed';
    const requests = mockApi({
      'GET /api/admin/notifications': ({ search }) => ({
        body: search === '?status=failed' && status === 'failed' ? [failed] : [],
      }),
      'POST /api/admin/notifications/n1/retry': () => {
        status = 'pending';
        return { status: 202, body: { id: 'n1', status: 'pending' } };
      },
    });
    renderAt(<NotificationLogPage />, {
      path: '/admin/notifications',
      route: '/admin/notifications?status=failed',
    });

    expect(await screen.findByText('Slack webhook answered 404 no_service')).toBeInTheDocument();
    expect(screen.getByText('Attempt 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('a deleted destination')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Failed' })).toHaveAttribute('aria-current', 'page');

    await user.click(
      screen.getByRole('button', {
        name: 'Retry the Notification to alice@demo.test about Cyclone Mira makes landfall',
      }),
    );
    // The log is refetched after the retry, so the row leaves the failed list.
    expect(
      await screen.findByRole('heading', { name: 'No failed Notifications' }),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST')).toBe(true);
    // The row unmounts when the refetch drops it; the confirmation must still show (CR62).
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Queued for delivery again');
    });
  });

  it('asks the API for every status when no filter is chosen', async () => {
    const requests = mockApi({ 'GET /api/admin/notifications': () => ({ body: [] }) });
    renderAt(<NotificationLogPage />, {
      path: '/admin/notifications',
      route: '/admin/notifications?status=bogus',
    });
    expect(
      await screen.findByRole('heading', { name: 'No Notifications yet' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(requests[0]?.search).toBe('');
    });
  });
});
