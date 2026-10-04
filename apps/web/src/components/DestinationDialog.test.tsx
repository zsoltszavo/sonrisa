import type { ChannelInfo } from '@sonrisa/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAt } from '@/test/render';
import { DestinationDialog } from './DestinationDialog';

const CHANNELS: ChannelInfo[] = [
  {
    key: 'email',
    name: 'Email',
    configSchema: {
      type: 'object',
      properties: { to: { type: 'string', format: 'email', title: 'Email address' } },
      required: ['to'],
    },
  },
  {
    key: 'slack',
    name: 'Slack',
    configSchema: {
      type: 'object',
      properties: { webhookUrl: { type: 'string', format: 'uri', title: 'Webhook URL' } },
      required: ['webhookUrl'],
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DestinationDialog', () => {
  it("swaps the config fields when the Channel changes and posts the chosen Channel's config", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const requests = mockApi({
      'POST /api/destinations': ({ body }) => ({
        status: 201,
        body: { id: 'd1', userId: 'u1', ...(body as object) },
      }),
    });
    renderAt(<DestinationDialog open onOpenChange={onOpenChange} channels={CHANNELS} />);

    expect(screen.getByRole('textbox', { name: 'Email address' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Slack' }));
    expect(screen.queryByRole('textbox', { name: 'Email address' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ops · #alerts');
    await user.type(
      screen.getByRole('textbox', { name: 'Webhook URL' }),
      'https://hooks.slack.com/services/T/B/x',
    );
    await user.click(screen.getByRole('button', { name: 'Add destination' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      channel: 'slack',
      label: 'Ops · #alerts',
      config: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
    });
  });

  it('checks the form before sending', async () => {
    const user = userEvent.setup();
    const requests = mockApi({});
    renderAt(<DestinationDialog open onOpenChange={vi.fn()} channels={CHANNELS} />);

    await user.click(screen.getByRole('button', { name: 'Add destination' }));

    expect(
      screen.getByText('Give the destination a name, up to 100 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter the email address.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows a rule only the server knows (the Slack host allowlist) on the field', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /api/destinations': () => ({
        status: 400,
        body: {
          message: 'Validation failed',
          issues: [
            {
              path: ['config', 'webhookUrl'],
              message: 'Use a Slack Incoming Webhook URL (https://hooks.slack.com/services/…)',
            },
          ],
        },
      }),
    });
    renderAt(<DestinationDialog open onOpenChange={vi.fn()} channels={CHANNELS} />);

    await user.click(screen.getByRole('radio', { name: 'Slack' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Elsewhere');
    await user.type(
      screen.getByRole('textbox', { name: 'Webhook URL' }),
      'https://example.com/hook',
    );
    await user.click(screen.getByRole('button', { name: 'Add destination' }));

    expect(await screen.findByRole('textbox', { name: 'Webhook URL' })).toHaveAccessibleDescription(
      /Use a Slack Incoming Webhook URL/,
    );
  });

  it('shows server issues that belong to no visible field as a form message', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /api/destinations': () => ({
        status: 400,
        body: {
          message: 'Validation failed',
          issues: [{ path: ['config'], message: 'Unrecognized key: "cc"' }],
        },
      }),
    });
    renderAt(<DestinationDialog open onOpenChange={vi.fn()} channels={CHANNELS} />);

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Inbox');
    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'me@example.com');
    await user.click(screen.getByRole('button', { name: 'Add destination' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unrecognized key: "cc"');
  });

  it("refuses to render a Channel whose schema it can't show", () => {
    mockApi({});
    renderAt(
      <DestinationDialog
        open
        onOpenChange={vi.fn()}
        channels={[
          {
            key: 'pager',
            name: 'Pager',
            configSchema: { type: 'object', properties: { level: { type: 'integer' } } },
          },
        ]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "The settings for this Channel can't be shown here.",
    );
    expect(screen.getByRole('button', { name: 'Add destination' })).toBeDisabled();
  });
});
