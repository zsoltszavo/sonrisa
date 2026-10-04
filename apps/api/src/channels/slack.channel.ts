import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { errorMessage } from '../common/error-message.js';
import type { Env } from '../config/env.js';
import { type ChannelProvider, DeliveryError, type DeliveryMessage } from './channel-provider.js';
import {
  categoryText,
  escalationText,
  headline,
  severityText,
  sourceName,
  TEST_TEXT,
  truncate,
  utcText,
  whyText,
} from './message.js';

const SLACK_HOST = 'hooks.slack.com';
const SEND_TIMEOUT_MS = 15_000;

/**
 * SSRF guard (review CR23): a webhook may point only at Slack itself or the configured Stand-in.
 * Part of the config schema, so it runs on save (a clear 400) and again before every send
 * (`ChannelRegistry` re-validates stored configs), since the allowed origin can change after saving. Exact hosts, so DNS can't be used to aim at another one.
 */
export function webhookUrlProblem(url: string, standinOrigin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL at all: the reason given to the user says what is accepted.
    return 'Webhook URL is not a valid URL';
  }
  if (parsed.username || parsed.password) return 'Webhook URL must not contain credentials';
  if (parsed.protocol === 'https:' && parsed.host === SLACK_HOST) {
    return parsed.pathname.startsWith('/services/')
      ? null
      : `Slack webhook URLs look like https://${SLACK_HOST}/services/…`;
  }
  if (standinOrigin !== '' && parsed.origin === new URL(standinOrigin).origin) return null;
  return standinOrigin === ''
    ? `Webhook URL must be a Slack Incoming Webhook (https://${SLACK_HOST}/services/…)`
    : `Webhook URL must be a Slack Incoming Webhook (https://${SLACK_HOST}/services/…) or the Slack Stand-in (${standinOrigin})`;
}

/** Slack's mrkdwn control characters (formatting docs): &, <, > must be escaped. */
export const escapeMrkdwn = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Escapes, then fits Slack's limit (review CR45): cutting the raw text keeps entities whole, and
 * the limit applies to the escaped length, which can be up to 5× the raw one (`&` → `&amp;`).
 */
export function escapedWithin(text: string, max: number): string {
  const escaped = escapeMrkdwn(text);
  if (escaped.length <= max) return escaped;
  let keep = Math.min(text.length, max - 1);
  while (keep > 0 && escapeMrkdwn(text.slice(0, keep)).length > max - 1) keep -= 1;
  return `${escapeMrkdwn(text.slice(0, keep))}…`;
}

const link = (url: string, label: string): string =>
  `<${escapeMrkdwn(url).replaceAll('|', '%7C')}|${escapeMrkdwn(label)}>`;

const mrkdwn = (text: string) => ({ type: 'mrkdwn' as const, text });

/**
 * The Incoming Webhook body: `text` is the notification/accessibility fallback, `blocks` the
 * Block Kit layout. Only header/section/context blocks, within Slack's documented limits
 * (header ≤ 150 plain_text, section text ≤ 3000, ≤ 10 fields of ≤ 2000, context ≤ 10 elements).
 */
export function renderSlackMessage(message: DeliveryMessage) {
  // The fallback text is mrkdwn too: unescaped, a title like "<!channel>" would ping everyone (CR42).
  const text = escapedWithin(headline(message), 3000);
  if (message.type === 'test') {
    return { text, blocks: [{ type: 'section' as const, text: mrkdwn(escapeMrkdwn(TEST_TEXT)) }] };
  }
  const { event } = message;
  const escalation = escalationText(message);
  const intro = escalation ? `*${escapeMrkdwn(escalation)}*` : '';
  const summary = event.summary
    ? escapedWithin(event.summary, 3000 - (intro ? intro.length + 2 : 0))
    : '';
  const body = [intro, summary].filter(Boolean).join('\n\n');
  const locationLabel = '*Location*\n';
  const fields = [
    `*Severity*\n${severityText(message.severity)}`,
    `*Category*\n${categoryText(event.category)}`,
    ...(event.location
      ? [locationLabel + escapedWithin(event.location, 2000 - locationLabel.length)]
      : []),
    `*Occurred*\n${utcText(event.occurredAt)}`,
  ];
  const source = `Source: ${sourceName(event.source)}`;
  const withLink = event.url ? `${source} · ${link(event.url, 'View details')}` : source;
  return {
    text,
    blocks: [
      {
        type: 'header' as const,
        text: { type: 'plain_text' as const, text: truncate(event.title, 150), emoji: true },
      },
      {
        type: 'section' as const,
        ...(body ? { text: mrkdwn(body) } : {}),
        fields: fields.map(mrkdwn),
      },
      {
        type: 'context' as const,
        elements: [
          // A link can't be cut; an absurdly long URL is left out instead.
          mrkdwn(withLink.length <= 3000 ? withLink : source),
          mrkdwn(escapedWithin(whyText(message), 3000)),
        ],
      },
    ],
  };
}

/** Seconds from a `Retry-After` header: delta-seconds or an HTTP date (RFC 9110 §10.2.3). */
export function parseRetryAfter(header: string | null, now: Date): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  // Only an IMF-fixdate ("Sun, 04 Oct 2026 12:00:00 GMT"): `Date.parse` alone reads "-5" as a year.
  const date = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(trimmed)
    ? Date.parse(trimmed)
    : Number.NaN;
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now.getTime()) / 1000));
}

/** Slack via Incoming Webhooks (D11); locally the Slack Stand-in (D12). */
@Injectable()
export class SlackChannel implements ChannelProvider<{ webhookUrl: string }> {
  readonly key = 'slack';
  readonly name = 'Slack';
  readonly configSchema;
  private readonly standinOrigin: string;

  constructor(config: ConfigService<Env, true>) {
    this.standinOrigin = config.get('SLACK_STANDIN_URL', { infer: true });
    this.configSchema = z.strictObject({
      // abort: an invalid URL gets one issue, not the host issue as well.
      webhookUrl: z
        .url({ protocol: /^https?$/, abort: true })
        .superRefine((url, ctx) => {
          const problem = webhookUrlProblem(url, this.standinOrigin);
          if (problem) ctx.addIssue({ code: 'custom', message: problem });
        })
        .meta({
          title: 'Webhook URL',
          description: 'The Incoming Webhook URL Slack gives you for one channel.',
        }),
    });
  }

  async send(
    config: { webhookUrl: string },
    message: DeliveryMessage,
    signal: AbortSignal,
  ): Promise<void> {
    // The host allowlist already ran: `ChannelRegistry` re-validates the config before every send.
    let response: Response;
    try {
      response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(renderSlackMessage(message)),
        // A redirect could lead anywhere, past the host check above.
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(SEND_TIMEOUT_MS)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new DeliveryError(`Slack webhook unreachable: ${errorMessage(error)}`, true);
    }
    if (response.ok) return;

    // Slack answers errors as a short plain-text code, e.g. `invalid_payload`, `no_service`.
    // An unreadable error body only loses detail; the status alone decides what happens next.
    const body = truncate((await response.text().catch(() => '')).trim(), 200);
    const reason = `Slack webhook answered ${String(response.status)}${body ? ` ${body}` : ''}`;
    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'), new Date());
      throw new DeliveryError(reason, true, retryAfter);
    }
    throw new DeliveryError(reason, response.status >= 500);
  }
}
