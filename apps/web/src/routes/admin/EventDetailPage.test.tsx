import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '@/test/render';
import { EventDetailPage } from './EventDetailPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const T = '2026-10-04T10:00:00.000Z';

describe('EventDetailPage', () => {
  it('shows the Severity history and the Notifications the Event caused', async () => {
    mockApi({
      'GET /api/admin/events/e1': () => ({
        body: {
          id: 'e1',
          source: 'simulated',
          externalId: 'sim-1',
          category: 'news',
          severity: 4,
          title: 'OPEC+ cut',
          summary: '',
          location: '',
          url: null,
          occurredAt: T,
          createdAt: T,
          updatedAt: T,
          notificationCount: 1,
          revisions: [
            { id: 'r1', previousSeverity: null, severity: 3, recordedAt: T },
            { id: 'r2', previousSeverity: 3, severity: 4, recordedAt: T },
          ],
          notifications: [
            {
              id: 'n1',
              kind: 'escalation',
              status: 'pending',
              severity: 4,
              attempts: 0,
              lastError: null,
              createdAt: T,
              sentAt: null,
              user: { id: 'u1', email: 'alice@demo.test' },
              event: { id: 'e1', title: 'OPEC+ cut', source: 'simulated', category: 'news' },
              destination: { id: 'd1', label: 'My email', channel: 'email' },
            },
          ],
        },
      }),
    });
    renderAt(<EventDetailPage />, { path: '/admin/events/:eventId', route: '/admin/events/e1' });

    expect(await screen.findByRole('heading', { level: 1, name: 'OPEC+ cut' })).toBeInTheDocument();
    const history = screen.getByRole('list', { name: 'Severity history' });
    expect(within(history).getByText(/First stored as Significant/)).toBeInTheDocument();
    expect(within(history).getByText(/Raised from 3 to 4/)).toBeInTheDocument();
    const caused = screen.getByRole('list', { name: 'Notifications about this Event' });
    expect(within(caused).getByText('Escalation')).toBeInTheDocument();
    expect(within(caused).getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change it in the Simulator' })).toHaveAttribute(
      'href',
      '/admin/simulator?event=e1',
    );
  });

  it('says so when the Event does not exist', async () => {
    mockApi({
      'GET /api/admin/events/nope': () => ({ status: 404, body: { message: 'Event not found' } }),
    });
    renderAt(<EventDetailPage />, { path: '/admin/events/:eventId', route: '/admin/events/nope' });
    expect(await screen.findByRole('heading', { name: 'Event not found' })).toBeInTheDocument();
  });
});
