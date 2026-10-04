import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filtersFrom, isRangeInverted } from '@/lib/event-filters';
import { mockApi, renderAt } from '@/test/render';
import { EventsPage } from './EventsPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const quake = {
  id: 'e1',
  source: 'usgs',
  externalId: 'us1',
  category: 'earthquake',
  severity: 4,
  title: 'M 6.2 - 41 km E of Miyako, Japan',
  summary: '',
  location: 'Miyako, Japan',
  url: null,
  occurredAt: '2026-10-04T10:00:00.000Z',
  createdAt: '2026-10-04T10:01:00.000Z',
  updatedAt: '2026-10-04T10:01:00.000Z',
  notificationCount: 2,
};

describe('filtersFrom', () => {
  it('keeps valid filters, drops invalid ones, and makes "until" cover its minute', () => {
    const filters = filtersFrom(
      new URLSearchParams(
        'source=usgs&category=volcano&minSeverity=9&from=2026-10-04T10:00&to=2026-10-04T11:30',
      ),
    );
    expect(filters).toEqual({
      source: 'usgs',
      category: undefined,
      minSeverity: undefined,
      from: new Date('2026-10-04T10:00').toISOString(),
      to: new Date(new Date('2026-10-04T11:30').getTime() + 59_999).toISOString(),
    });
    expect(filtersFrom(new URLSearchParams('from=2026-13-45T99:99')).from).toBeUndefined();
  });

  it('drops an inverted time range instead of sending a request the API refuses', () => {
    const params = new URLSearchParams('from=2026-10-05T10:00&to=2026-10-04T10:00');
    expect(filtersFrom(params)).toMatchObject({ from: undefined, to: undefined });
    expect(isRangeInverted(params)).toBe(true);
    expect(isRangeInverted(new URLSearchParams('from=2026-10-04T10:00&to=2026-10-04T10:00'))).toBe(
      false,
    );
  });
});

describe('EventsPage', () => {
  it('sends the chosen filters to the API and links each Event to its detail', async () => {
    const user = userEvent.setup();
    const requests = mockApi({ 'GET /api/admin/events': () => ({ body: [quake] }) });
    const { router } = renderAt(<EventsPage />, { path: '/admin/events', route: '/admin/events' });

    expect(await screen.findByRole('link', { name: quake.title })).toHaveAttribute(
      'href',
      '/admin/events/e1',
    );
    await user.selectOptions(screen.getByLabelText('Source'), 'usgs');
    await user.selectOptions(screen.getByLabelText('Minimum Severity'), '4');

    await waitFor(() => {
      expect(requests.at(-1)?.search).toBe('?source=usgs&minSeverity=4');
    });
    expect(router.state.location.search).toBe('?source=usgs&minSeverity=4');
  });

  it('explains an empty filtered result and clears the filters', async () => {
    const user = userEvent.setup();
    const requests = mockApi({ 'GET /api/admin/events': () => ({ body: [] }) });
    renderAt(<EventsPage />, { path: '/admin/events', route: '/admin/events?category=market' });
    expect(
      await screen.findByRole('heading', { name: 'No Events match these filters' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(requests.at(-1)?.search).toBe('');
    });
  });
});
