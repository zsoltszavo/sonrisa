import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '@/test/render';
import { EventSourcesPage } from './EventSourcesPage';

const usgs = {
  id: 's1',
  key: 'usgs',
  name: 'USGS earthquakes',
  enabled: true,
  intervalSec: 60,
  freshnessHours: 6,
  lastPollAt: new Date(Date.now() - 120_000).toISOString(),
  lastError: 'USGS answered 503',
};
const simulated = {
  ...usgs,
  id: 's3',
  key: 'simulated',
  name: 'Simulated Source',
  intervalSec: null,
  lastPollAt: null,
  lastError: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const card = async (name: string) => {
  const heading = await screen.findByRole('heading', { name });
  const item = heading.closest('li');
  if (!item) throw new Error(`no card for ${name}`);
  return within(item);
};

describe('EventSourcesPage', () => {
  it('shows the last poll error, and the Simulated Source has no polling controls', async () => {
    mockApi({ 'GET /api/admin/event-sources': () => ({ body: [usgs, simulated] }) });
    renderAt(<EventSourcesPage />);
    const quakes = await card('USGS earthquakes');
    expect(quakes.getByText('USGS answered 503')).toBeInTheDocument();
    expect(quakes.getByText(/failed/)).toBeInTheDocument();
    const sim = await card('Simulated Source');
    expect(sim.queryByRole('button', { name: 'Poll now' })).not.toBeInTheDocument();
    expect(sim.queryByLabelText('Polling interval (seconds)')).not.toBeInTheDocument();
  });

  it('saves only the changed fields and toggles enabled', async () => {
    const user = userEvent.setup();
    let source = usgs;
    const requests = mockApi({
      'GET /api/admin/event-sources': () => ({ body: [source] }),
      'PATCH /api/admin/event-sources/usgs': ({ body }) => {
        source = { ...source, ...(body as object) };
        return { body: source };
      },
    });
    renderAt(<EventSourcesPage />);
    const quakes = await card('USGS earthquakes');
    const save = quakes.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    const interval = quakes.getByLabelText('Polling interval (seconds)');
    await user.clear(interval);
    await user.type(interval, '120');
    await user.click(save);
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'PATCH').map((r) => r.body)).toEqual([
        { intervalSec: 120 },
      ]);
    });
    // The list is refetched, so the card reflects the server.
    expect(
      await (await card('USGS earthquakes')).findByText('Polled every 2 min'),
    ).toBeInTheDocument();

    await user.click((await card('USGS earthquakes')).getByRole('button', { name: 'Disable' }));
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'PATCH').at(-1)?.body).toEqual({ enabled: false });
    });
  });

  it('shows a server validation issue on its field', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/admin/event-sources': () => ({ body: [usgs] }),
      'PATCH /api/admin/event-sources/usgs': () => ({
        status: 400,
        body: {
          message: 'Validation failed',
          issues: [{ path: ['freshnessHours'], message: 'Too big: at most 720' }],
        },
      }),
    });
    renderAt(<EventSourcesPage />);
    const quakes = await card('USGS earthquakes');
    const freshness = quakes.getByLabelText('Freshness Window (hours)');
    await user.clear(freshness);
    await user.type(freshness, '9');
    await user.click(quakes.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(freshness).toHaveAccessibleDescription('Too big: at most 720');
    });
  });

  it('polls now and shows what the poll did', async () => {
    const user = userEvent.setup();
    const requests = mockApi({
      'GET /api/admin/event-sources': () => ({ body: [usgs] }),
      'POST /api/admin/event-sources/usgs/poll': () => ({
        body: {
          source: 'usgs',
          fetched: 9,
          created: 2,
          updated: 1,
          unchanged: 6,
          ignored: 0,
          skipped: 0,
          failed: 0,
          error: null,
        },
      }),
    });
    renderAt(<EventSourcesPage />);
    await user.click((await card('USGS earthquakes')).getByRole('button', { name: 'Poll now' }));
    expect(await screen.findByText('Poll finished')).toBeInTheDocument();
    expect(screen.getByText('new').nextSibling).toHaveTextContent('2');
    // Status is refreshed after a poll.
    expect(requests.filter((r) => r.path === '/api/admin/event-sources').length).toBeGreaterThan(1);
  });

  it('shows an error with a retry when the sources fail to load', async () => {
    mockApi({
      'GET /api/admin/event-sources': () => ({
        status: 403,
        body: { message: 'Forbidden resource' },
      }),
    });
    renderAt(<EventSourcesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden resource');
  });
});
