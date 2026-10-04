import { type EventSourceKey, SEVERITY_LABELS, type Severity } from '@sonrisa/shared';
import type { DeliveryMessage } from './channel-provider.js';

type NotificationMessage = Extract<DeliveryMessage, { type: 'notification' }>;

const SOURCE_NAMES: Record<EventSourceKey, string> = {
  usgs: 'USGS',
  gdacs: 'GDACS',
  simulated: 'Simulated Source',
};

export const sourceName = (key: EventSourceKey): string => SOURCE_NAMES[key];

export const severityText = (severity: Severity): string =>
  `${SEVERITY_LABELS[severity]} (${String(severity)}/5)`;

export const categoryText = (category: string): string =>
  category.charAt(0).toUpperCase() + category.slice(1);

/** "2026-10-04 16:40 UTC": the same for every reader, whatever their time zone. */
export const utcText = (date: Date): string =>
  `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

/** One line that works as an email subject and as Slack's notification fallback text. */
export function headline(message: DeliveryMessage): string {
  if (message.type === 'test') return `Test message for "${message.destinationLabel}"`;
  const { kind, event, severity } = message;
  return kind === 'escalation'
    ? `Escalated to ${severityText(severity)}: ${event.title}`
    : `${severityText(severity)} ${event.category}: ${event.title}`;
}

export function escalationText(message: NotificationMessage): string | null {
  if (message.kind !== 'escalation') return null;
  const from =
    message.previousSeverity === null ? 'a lower Severity' : severityText(message.previousSeverity);
  return `The source revised this Event: Severity went up from ${from} to ${severityText(message.severity)}.`;
}

export function whyText(message: NotificationMessage): string {
  const rules =
    message.ruleCount === 1
      ? '1 of your Alert Rules'
      : `${String(message.ruleCount)} of your Alert Rules`;
  return `You get this because ${rules} matched (destination "${message.destinationLabel}").`;
}

/** Cuts to `max` characters, marking the cut with an ellipsis. */
export const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

export const TEST_TEXT =
  'This is a test from World Event Alerts. If you can read it, this Channel Destination works.';
