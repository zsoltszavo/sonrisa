import { createHash } from 'node:crypto';
import type { Event } from '@sonrisa/shared';

/**
 * Fingerprint of everything an Event shows, used to tell an Event Update from a repeat of the
 * same item (D15: GDACS `datemodified` is unreliable, so no source's own timestamps are trusted).
 * Identity fields (source, externalId) are left out: they are the lookup key, not content.
 */
export function contentHash(event: Event): string {
  const content = [
    event.category,
    event.severity,
    event.title,
    event.summary,
    event.location,
    event.url,
    event.occurredAt.toISOString(),
  ];
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}
