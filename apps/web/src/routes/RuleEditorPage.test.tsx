import type { StoredEvent } from '@sonrisa/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '@/test/render';
import { RuleEditorPage } from './RuleEditorPage';

function quake(
  id: string,
  severity: StoredEvent['severity'],
  title: string,
  location = '',
): StoredEvent {
  return {
    id,
    source: 'usgs',
    externalId: id,
    category: 'earthquake',
    severity,
    title,
    summary: '',
    location,
    url: null,
    occurredAt: new Date('2026-10-04T10:00:00Z'),
  };
}

const QUAKES = [
  quake('q1', 2, 'M 4.3 - 12 km NW of Hachiōji, Tōkyō, Japan'),
  quake('q2', 4, 'M 6.2 - 41 km E of Miyako, Japan'),
  quake('q3', 3, 'M 5.4 - Off the coast of Valparaíso, Chile'),
  quake('q4', 5, 'M 7.1 - Banda Sea', 'Indonesia'),
];

const DESTINATIONS = [
  {
    id: 'd-email',
    userId: 'u1',
    channel: 'email',
    label: 'My email',
    config: { to: 'me@example.com' },
  },
  {
    id: 'd-slack',
    userId: 'u1',
    channel: 'slack',
    label: 'Team · #alerts',
    config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
  },
];

function setup(overrides: Parameters<typeof mockApi>[0] = {}) {
  const requests = mockApi({
    'GET /api/destinations': () => ({ body: DESTINATIONS }),
    'GET /api/channels': () => ({ body: [] }),
    'GET /api/events/recent': ({ search }) => ({
      body: new URLSearchParams(search).get('category') === 'earthquake' ? QUAKES : [],
    }),
    ...overrides,
  });
  const view = renderAt(<RuleEditorPage />, { path: '/rules/new', route: '/rules/new' });
  return { requests, ...view };
}

/** The preview's sentence, e.g. "2 of the last 4 earthquakes would have matched." */
async function previewSentence() {
  const preview = await screen.findByRole('region', { name: 'Preview' });
  const sentence = await within(preview).findByText(
    /of the last \d+ earthquakes would have matched/,
  );
  return sentence.textContent.replace(/\s+/g, ' ').trim();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Rule editor live preview', () => {
  it('counts matches with the shared matches(): Severity threshold, then accent-insensitive keywords', async () => {
    const user = userEvent.setup();
    setup();

    // Default new rule: earthquakes, Severity 4+ → M6.2 and M7.1.
    expect(await previewSentence()).toBe('2 of the last 4 earthquakes would have matched.');

    fireEvent.change(screen.getByRole('slider', { name: 'How severe, at least?' }), {
      target: { value: '2' },
    });
    expect(await previewSentence()).toBe('4 of the last 4 earthquakes would have matched.');

    // "tokyo" typed without macrons must match "Tōkyō" (D4), as on the server.
    await user.type(screen.getByRole('textbox', { name: /Keywords/ }), 'tokyo{Enter}');
    expect(await previewSentence()).toBe('1 of the last 4 earthquakes would have matched.');
    expect(
      within(screen.getByRole('list', { name: 'Matching Events' })).getByText(/Hachiōji/),
    ).toBeInTheDocument();
  });

  it('describes the slider value in the source’s own terms for screen readers', async () => {
    setup();
    const slider = await screen.findByRole('slider', { name: 'How severe, at least?' });
    expect(slider).toHaveAttribute('aria-valuetext', '4 or higher, Severe: M6 and above');
  });

  it('loads Events and suggestions for the chosen Category', async () => {
    const user = userEvent.setup();
    const { requests } = setup();
    await previewSentence();
    expect(screen.getByRole('button', { name: 'Add keyword tsunami' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Disasters' }));

    expect(await screen.findByText(/No disasters have arrived yet/)).toBeInTheDocument();
    expect(
      requests.some((r) => r.path === '/api/events/recent' && r.search === '?category=disaster'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Add keyword flood' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add keyword tsunami' })).not.toBeInTheDocument();
  });
});

describe('Rule editor keywords', () => {
  it('adds a suggestion chip and refuses the same keyword typed with different case', async () => {
    const user = userEvent.setup();
    setup();
    await previewSentence();

    await user.click(screen.getByRole('button', { name: 'Add keyword Japan' }));
    expect(
      within(screen.getByRole('list', { name: 'Keywords on this rule' })).getByText('Japan'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add keyword Japan' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Keywords/ }), 'JAPAN{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('"JAPAN" is already on this rule.');

    await user.click(screen.getByRole('button', { name: 'Remove keyword Japan' }));
    expect(screen.queryByRole('list', { name: 'Keywords on this rule' })).not.toBeInTheDocument();
  });
});

describe('Rule editor keyword paste', () => {
  it('keeps every keyword of a comma-separated paste and leaves refused ones in the box', async () => {
    const user = userEvent.setup();
    setup();
    await previewSentence();
    const box = screen.getByRole('textbox', { name: /Keywords/ });

    await user.click(box);
    await user.paste('oil, gas, OIL, gold');

    const chips = within(screen.getByRole('list', { name: 'Keywords on this rule' }));
    expect(chips.getByText('oil')).toBeInTheDocument();
    expect(chips.getByText('gas')).toBeInTheDocument();
    // "OIL" repeats "oil" (refused, kept for editing); "gold" has no comma after it yet.
    expect(box).toHaveValue('OIL, gold');
    expect(screen.getByRole('alert')).toHaveTextContent('"OIL" is already on this rule.');
  });
});

describe('Rule editor saving', () => {
  it('sends the rule to the API and returns to the list', async () => {
    const user = userEvent.setup();
    const { requests } = setup({
      'POST /api/rules': ({ body }) => ({
        status: 201,
        body: { id: 'r1', userId: 'u1', ...(body as object) },
      }),
    });
    await previewSentence();

    await user.click(screen.getByRole('button', { name: 'Add keyword Chile' }));
    await user.click(screen.getByRole('checkbox', { name: /Team · #alerts/ }));
    await user.click(screen.getByRole('button', { name: 'Create rule' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/rules');
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      category: 'earthquake',
      minSeverity: 4,
      keywords: ['Chile'],
      destinationIds: ['d-slack'],
    });
  });

  it('asks for a destination before sending anything', async () => {
    const user = userEvent.setup();
    const { requests } = setup();
    await previewSentence();

    await user.click(screen.getByRole('button', { name: 'Create rule' }));

    expect(await screen.findByText('Choose at least one destination.')).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it("shows the server's validation issue next to the field", async () => {
    const user = userEvent.setup();
    setup({
      'POST /api/rules': () => ({
        status: 400,
        body: {
          message: 'Validation failed',
          issues: [{ path: ['destinationIds'], message: 'Unknown destination' }],
        },
      }),
    });
    await previewSentence();

    await user.click(screen.getByRole('checkbox', { name: /My email/ }));
    await user.click(screen.getByRole('button', { name: 'Create rule' }));

    expect(await screen.findByText('Unknown destination')).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });
});
