import type { AlertRule, Severity } from './event.js';
import { eventMatcher, type MatchableEvent } from './matching.js';

/**
 * A (User, Channel Destination) pair (D18(c)). A pair can get one match and then several
 * Escalations for the same Event, each at a higher Severity, so the dedup key is (pair, Event, Severity) (D19(a)).
 */
export interface Recipient {
  userId: string;
  destinationId: string;
}

export interface NotifiedRecipient extends Recipient {
  /** The highest Severity this recipient has been notified about for this Event. */
  highestSeverity: Severity;
}

export type NotificationKind = 'match' | 'escalation';

export interface NotificationDecision extends Recipient {
  kind: NotificationKind;
  /** Every Alert Rule of this user that matched and notifies this destination. */
  ruleIds: string[];
}

export interface DecideNotificationsInput {
  /** The new Event, or the latest version of an Event Update. */
  event: MatchableEvent;
  rules: readonly Pick<
    AlertRule,
    'id' | 'userId' | 'destinationIds' | 'category' | 'minSeverity' | 'keywords'
  >[];
  /** Recipients that already received a Notification about this Event. */
  alreadyNotified: readonly NotifiedRecipient[];
}

const recipientKey = (r: Recipient): string => JSON.stringify([r.userId, r.destinationId]);

/**
 * What to send for one ingested Event or Event Update (ADR 0001):
 * - every Alert Rule is checked against the Event; a Recipient not yet notified gets a `match`;
 * - an already-notified Recipient that still matches gets an `escalation` only when the Severity
 *   is above the highest one it was told about, so a revision that dips and comes back
 *   (M5.9 → 6.0 → 5.9 → 6.0) escalates once, not twice. A rule deleted or narrowed since doesn't escalate;
 * - downgrades and text-only edits never notify already-notified Recipients.
 *
 * Ownership of `destinationIds` is enforced when a rule is saved (S3 API), not here.
 * Freshness is checked separately (`isFresh`) before calling this.
 */
export function decideNotifications(input: DecideNotificationsInput): NotificationDecision[] {
  const { event, rules, alreadyNotified } = input;
  const isMatch = eventMatcher(event);

  const matched = new Map<string, { recipient: Recipient; ruleIds: string[] }>();
  for (const rule of rules) {
    if (!isMatch(rule)) continue;
    for (const destinationId of new Set(rule.destinationIds)) {
      const recipient = { userId: rule.userId, destinationId };
      const key = recipientKey(recipient);
      const entry = matched.get(key) ?? { recipient, ruleIds: [] };
      entry.ruleIds.push(rule.id);
      matched.set(key, entry);
    }
  }

  const highestNotified = new Map(alreadyNotified.map((r) => [recipientKey(r), r.highestSeverity]));

  const decisions: NotificationDecision[] = [];
  for (const [key, { recipient, ruleIds }] of matched) {
    const highest = highestNotified.get(key);
    if (highest === undefined) {
      decisions.push({ ...recipient, kind: 'match', ruleIds });
    } else if (event.severity > highest) {
      decisions.push({ ...recipient, kind: 'escalation', ruleIds });
    }
  }
  return decisions;
}
