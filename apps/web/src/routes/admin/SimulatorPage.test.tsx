import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '@/test/render';
import { SimulatorPage } from './SimulatorPage';

const NOW = '2026-10-04T18:00:00.000Z';

const event = (severity: number) => ({
  id: 'e1',
  source: 'simulated',
  externalId: 'sim-1',
  category: 'news',
  severity,
  title: 'OPEC+ agrees surprise oil output cut',
  summary: 'Members cut output.',
  location: 'Vienna, Austria',
  url: null,
  occurredAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  notificationCount: severity === 4 ? 2 : 1,
});

const notification = (kind: 'match' | 'escalation', severity: number) => ({
  id: `n-${kind}`,
  kind,
  status: 'sent',
  severity,
  attempts: 1,
  lastError: null,
  createdAt: NOW,
  sentAt: NOW,
  user: { id: 'u1', email: 'alice@demo.test' },
  event: {
    id: 'e1',
    title: 'OPEC+ agrees surprise oil output cut',
    source: 'simulated',
    category: 'news',
  },
  destination: { id: 'd1', label: 'My email', channel: 'email' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SimulatorPage', () => {
  it('raises the selected Event and shows the Escalation it caused', async () => {
    const user = userEvent.setup();
    let severity = 3;
    const detail = () => ({
      ...event(severity),
      revisions: [
        { id: 'r1', previousSeverity: null, severity: 3, recordedAt: NOW },
        ...(severity === 4
          ? [{ id: 'r2', previousSeverity: 3, severity: 4, recordedAt: NOW }]
          : []),
      ],
      notifications:
        severity === 4
          ? [notification('escalation', 4), notification('match', 3)]
          : [notification('match', 3)],
    });
    const requests = mockApi({
      'GET /api/admin/events': () => ({ body: [event(severity)] }),
      'GET /api/admin/events/e1': () => ({ body: detail() }),
      'PUT /api/admin/simulated-events/e1': () => {
        severity = 4;
        return { body: event(4) };
      },
    });
    renderAt(<SimulatorPage />, { path: '/admin/simulator', route: '/admin/simulator?event=e1' });

    const panel = (
      await screen.findByRole('heading', { name: 'OPEC+ agrees surprise oil output cut' })
    ).closest('section');
    if (!panel) throw new Error('selected Event panel missing');
    const update = within(panel).getByRole('button', { name: 'Update Severity' });
    expect(update).toBeDisabled();

    await user.click(within(panel).getByRole('radio', { name: '4, Severe' }));
    expect(within(panel).getByText(/sends an Escalation/)).toBeInTheDocument();
    await user.click(update);

    // The whole Event is sent back with only the Severity changed (PUT replaces it).
    await waitFor(() => {
      expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({
        category: 'news',
        severity: 4,
        title: 'OPEC+ agrees surprise oil output cut',
        summary: 'Members cut output.',
        location: 'Vienna, Austria',
        url: null,
      });
    });
    // The mutation refreshes the detail, so the Escalation appears without a reload.
    const list = await within(panel).findByRole('list', {
      name: 'Notifications about the selected Event',
    });
    expect(within(list).getByText('Escalation')).toBeInTheDocument();
    expect(within(panel).getByRole('list', { name: 'Severity history' }).children).toHaveLength(2);
  });

  it('creates an Event from the form and selects it', async () => {
    const user = userEvent.setup();
    const requests = mockApi({
      'GET /api/admin/events': () => ({ body: [] }),
      'POST /api/admin/simulated-events': () => ({ status: 201, body: event(3) }),
      'GET /api/admin/events/e1': () => ({
        body: { ...event(3), revisions: [], notifications: [] },
      }),
    });
    const { router } = renderAt(<SimulatorPage />, {
      path: '/admin/simulator',
      route: '/admin/simulator',
    });

    expect(
      await screen.findByRole('heading', { name: 'Nothing simulated yet' }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Category'), 'market');
    await user.selectOptions(screen.getByLabelText('Severity'), '5');
    await user.type(screen.getByLabelText('Title'), '  Forint slides  ');
    await user.type(screen.getByLabelText('Location'), 'Budapest');
    await user.click(screen.getByRole('button', { name: 'Create Event' }));

    await waitFor(() => {
      expect(router.state.location.search).toBe('?event=e1');
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      category: 'market',
      severity: 5,
      title: 'Forint slides',
      summary: '',
      location: 'Budapest',
      url: null,
    });
  });

  it('puts a server validation issue on its field', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/admin/events': () => ({ body: [] }),
      'POST /api/admin/simulated-events': () => ({
        status: 400,
        body: { message: 'Validation failed', issues: [{ path: ['url'], message: 'Invalid URL' }] },
      }),
    });
    renderAt(<SimulatorPage />, { path: '/admin/simulator', route: '/admin/simulator' });
    await user.type(await screen.findByLabelText('Title'), 'x');
    await user.click(screen.getByRole('button', { name: 'Create Event' }));
    const url = screen.getByLabelText('Link (optional)');
    await waitFor(() => {
      expect(url).toHaveAttribute('aria-invalid', 'true');
    });
    expect(url).toHaveAccessibleDescription('Invalid URL');
  });
});
