import type { Event } from './event.js';

const HOUR_MS = 60 * 60 * 1000;

/** Default Freshness Window per Event Source (D15). */
export const DEFAULT_FRESHNESS_HOURS = 6;

/**
 * Whether an Event is recent enough to trigger Notifications (D15). The boundary is inclusive.
 * Events dated in the future (clock skew, scheduled feeds) count as fresh.
 */
export function isFresh(
  event: Pick<Event, 'occurredAt'>,
  freshnessHours: number,
  now: Date,
): boolean {
  return now.getTime() - event.occurredAt.getTime() <= freshnessHours * HOUR_MS;
}
