import type { StoredEvent } from '@sonrisa/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DeliveryMessage } from './channel-provider.js';
import {
  escapeMrkdwn,
  parseRetryAfter,
  renderSlackMessage,
  webhookUrlProblem,
} from './slack.channel.js';

/**
 * Contract test (D12): the Incoming Webhook body as Slack documents it, written independently of
 * the renderer. Strict objects, so a made-up Block Kit field fails.
 * - https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks
 * - https://docs.slack.dev/reference/block-kit/blocks/header-block (plain_text, ≤ 150)
 * - https://docs.slack.dev/reference/block-kit/blocks/section-block (text ≤ 3000; ≤ 10 fields ≤ 2000)
 * - https://docs.slack.dev/reference/block-kit/blocks/context-block (≤ 10 elements)
 * - https://docs.slack.dev/reference/block-kit/composition-objects/text-object (`emoji` plain_text only)
 */
const plainText = (max: number) =>
  z.strictObject({
    type: z.literal('plain_text'),
    text: z.string().min(1).max(max),
    emoji: z.boolean().optional(),
  });
const mrkdwnText = (max: number) =>
  z.strictObject({
    type: z.literal('mrkdwn'),
    text: z.string().min(1).max(max),
    verbatim: z.boolean().optional(),
  });
const textObject = (max: number) => z.union([plainText(max), mrkdwnText(max)]);
const slackWebhookPayload = z.strictObject({
  text: z.string().min(1),
  blocks: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({ type: z.literal('header'), text: plainText(150) }),
        z
          .strictObject({
            type: z.literal('section'),
            text: textObject(3000).optional(),
            fields: z.array(textObject(2000)).min(1).max(10).optional(),
          })
          .refine((s) => s.text !== undefined || s.fields !== undefined),
        z.strictObject({
          type: z.literal('context'),
          elements: z.array(textObject(3000)).min(1).max(10),
        }),
      ]),
    )
    .max(50),
});

const event: StoredEvent = {
  id: 'evt-1',
  source: 'usgs',
  externalId: 'us7000abcd',
  category: 'earthquake',
  severity: 4,
  title: 'M 6.1 - 37 km N of Sutcliffe, Nevada',
  summary: 'Felt widely <strong> & reported',
  location: '37 km N of Sutcliffe, Nevada',
  url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd?a=1&b=2',
  occurredAt: new Date('2026-10-04T16:40:00Z'),
};

const notification = (
  overrides: Partial<StoredEvent> = {},
  kind: 'match' | 'escalation' = 'match',
): DeliveryMessage => ({
  type: 'notification',
  notificationId: 'n-1',
  kind,
  event: { ...event, ...overrides },
  severity: 4,
  previousSeverity: kind === 'escalation' ? 3 : null,
  ruleCount: 2,
  destinationLabel: 'sonrisa · #world-alerts',
});

describe('renderSlackMessage (contract)', () => {
  it.each([
    ['a typical match', notification()],
    ['an escalation', notification({}, 'escalation')],
    ['empty summary, location and url', notification({ summary: '', location: '', url: null })],
    [
      'very long title, summary and location',
      notification({
        title: 'T'.repeat(500),
        summary: 'S'.repeat(5000),
        location: 'L'.repeat(3000),
      }),
    ],
    [
      'a long escalation with a long summary',
      notification({ summary: 'S'.repeat(3000) }, 'escalation'),
    ],
    [
      'escape-heavy long location and summary (CR45)',
      notification({ location: '&<>'.repeat(1000), summary: '&'.repeat(4000) }, 'escalation'),
    ],
    ['a very long url', notification({ url: `https://example.test/${'a'.repeat(4000)}` })],
    [
      'a test message',
      { type: 'test', destinationLabel: 'x'.repeat(100) } satisfies DeliveryMessage,
    ],
  ])('matches the documented webhook format for %s', (_name, message) => {
    expect(() => slackWebhookPayload.parse(renderSlackMessage(message))).not.toThrow();
  });

  it('escapes mrkdwn control characters from event text', () => {
    const payload = JSON.stringify(renderSlackMessage(notification()));
    expect(payload).toContain('Felt widely &lt;strong&gt; &amp; reported');
    expect(payload).toContain(
      '<https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd?a=1&amp;b=2|View details>',
    );
  });

  it('escapes the fallback text too, so a title cannot mention @channel (CR42)', () => {
    const payload = renderSlackMessage(
      notification({ title: '<!channel> <https://evil.test|Official>' }),
    );
    expect(payload.text).toBe(
      'Severe (4/5) earthquake: &lt;!channel&gt; &lt;https://evil.test|Official&gt;',
    );
  });

  it('cuts escaped text without splitting an entity (CR45)', () => {
    const payload = JSON.stringify(renderSlackMessage(notification({ summary: '&'.repeat(4000) })));
    expect(payload).toMatch(/(&amp;)+…/);
    expect(payload).not.toMatch(/&a?m?p?…/);
  });

  it('says what changed in an Escalation and puts the Severity in the fallback text', () => {
    const payload = renderSlackMessage(notification({}, 'escalation'));
    expect(payload.text).toBe('Escalated to Severe (4/5): M 6.1 - 37 km N of Sutcliffe, Nevada');
    expect(JSON.stringify(payload.blocks)).toContain('from Significant (3/5) to Severe (4/5)');
  });

  it('escapeMrkdwn escapes & first, so entities are not double-escaped wrongly', () => {
    expect(escapeMrkdwn('a<b>&c')).toBe('a&lt;b&gt;&amp;c');
  });
});

describe('webhookUrlProblem (SSRF guard, CR23)', () => {
  const standin = 'http://localhost:4010';
  it.each([
    'https://hooks.slack.com/services/T000/B000/XXXX',
    'http://localhost:4010/hooks/world-alerts',
  ])('allows %s', (url) => {
    expect(webhookUrlProblem(url, standin)).toBeNull();
  });

  it.each([
    'http://hooks.slack.com/services/T000/B000/XXXX',
    'https://hooks.slack.com.evil.test/services/x',
    'https://hooks.slack.com/api/other',
    'https://hooks.slack.com:8443/services/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:5433/',
    'http://127.0.0.1:4010/hooks/world-alerts',
    'http://localhost:4010@evil.test/hooks/x',
    'http://user:pass@localhost:4010/hooks/x',
    'not a url',
  ])('blocks %s', (url) => {
    expect(webhookUrlProblem(url, standin)).not.toBeNull();
  });

  it('allows only real Slack when no Stand-in is configured', () => {
    expect(webhookUrlProblem('http://localhost:4010/hooks/world-alerts', '')).not.toBeNull();
    expect(webhookUrlProblem('https://hooks.slack.com/services/T/B/X', '')).toBeNull();
  });
});

describe('parseRetryAfter', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  it('reads delta-seconds and HTTP dates', () => {
    expect(parseRetryAfter('30', now)).toBe(30);
    expect(parseRetryAfter('Sun, 04 Oct 2026 12:01:00 GMT', now)).toBe(60);
    expect(parseRetryAfter('Sun, 04 Oct 2026 11:00:00 GMT', now)).toBe(0);
  });
  it('ignores a missing or unreadable header', () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter('-5', now)).toBeNull();
  });
});
