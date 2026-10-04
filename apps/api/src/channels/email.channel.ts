import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { emailSchema } from '@sonrisa/shared';
import { createTransport, type Transporter } from 'nodemailer';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { type ChannelProvider, DeliveryError, type DeliveryMessage } from './channel-provider.js';
import {
  categoryText,
  escalationText,
  headline,
  severityText,
  sourceName,
  TEST_TEXT,
  utcText,
  whyText,
} from './message.js';

// title/description/format reach the generated destination form through GET /channels (D11).
// `format` is set by hand: emailSchema trims and lower-cases first, and JSON Schema can't show a transform.
const configSchema = z.strictObject({
  to: emailSchema.meta({
    title: 'Email address',
    description: 'Alerts are sent to this address.',
    format: 'email',
  }),
});
type EmailConfig = z.infer<typeof configSchema>;

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** Nodemailer puts the SMTP reply code on its errors; 5xx is a permanent rejection (RFC 5321). */
const smtpErrorSchema = z.object({ responseCode: z.number().optional(), message: z.string() });

/** Settles with `work`, or rejects with the signal's reason as soon as it aborts. */
function abortable<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderEmail(message: DeliveryMessage): RenderedEmail {
  const subject = headline(message);
  if (message.type === 'test') {
    return { subject, text: TEST_TEXT, html: `<p>${escapeHtml(TEST_TEXT)}</p>` };
  }
  const { event } = message;
  const facts: [string, string][] = [
    ['Severity', severityText(message.severity)],
    ['Category', categoryText(event.category)],
    ...(event.location ? [['Location', event.location] satisfies [string, string]] : []),
    ['Occurred', utcText(event.occurredAt)],
    ['Source', sourceName(event.source)],
  ];
  const escalation = escalationText(message);
  const why = whyText(message);
  const text = [
    event.title,
    '',
    ...(escalation ? [escalation, ''] : []),
    ...(event.summary ? [event.summary, ''] : []),
    ...facts.map(([label, value]) => `${label}: ${value}`),
    ...(event.url ? ['', `Details: ${event.url}`] : []),
    '',
    '--',
    why,
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1c1d;max-width:600px">
<h2 style="margin:0 0 8px">${escapeHtml(event.title)}</h2>
${escalation ? `<p style="background:#fff4cc;padding:8px 12px;border-radius:4px"><strong>${escapeHtml(escalation)}</strong></p>` : ''}
${event.summary ? `<p>${escapeHtml(event.summary)}</p>` : ''}
<table style="border-collapse:collapse">${facts
    .map(
      ([label, value]) =>
        `<tr><th style="text-align:left;padding:2px 16px 2px 0;color:#616061">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>
${event.url ? `<p><a href="${escapeHtml(event.url)}">View details at ${escapeHtml(sourceName(event.source))}</a></p>` : ''}
<p style="color:#616061;font-size:12px;border-top:1px solid #ddd;padding-top:8px">${escapeHtml(why)}</p>
</body></html>`;
  return { subject, text, html };
}

/** Email via SMTP (Nodemailer). Locally that is Mailpit: real delivery is a next step (D11). */
@Injectable()
export class EmailChannel implements ChannelProvider<EmailConfig>, OnModuleDestroy {
  readonly key = 'email';
  readonly name = 'Email';
  readonly configSchema = configSchema;
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.transport = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
      // Short enough that a send ends well inside the job's expiry and the shutdown drain (CR41).
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  async send(config: EmailConfig, message: DeliveryMessage, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const { subject, text, html } = renderEmail(message);
    try {
      // Nodemailer takes no AbortSignal, so the caller stops waiting on abort (CR41). The SMTP
      // exchange may still finish in the background: delivery is at-least-once (D21(a)).
      await abortable(
        signal,
        this.transport.sendMail({
          from: this.from,
          to: config.to,
          subject,
          text,
          html,
          // A resend of the same Notification keeps its Message-ID, so mail clients can spot the repeat.
          ...(message.type === 'notification' && {
            messageId: `<${message.notificationId}@world-event-alerts.sonrisa.test>`,
          }),
        }),
      );
    } catch (error) {
      if (signal.aborted) throw error;
      const parsed = smtpErrorSchema.safeParse(error);
      if (!parsed.success) throw error;
      const { responseCode, message: reason } = parsed.data;
      const permanent = responseCode !== undefined && responseCode >= 500 && responseCode < 600;
      throw new DeliveryError(`SMTP: ${reason}`, !permanent);
    }
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
