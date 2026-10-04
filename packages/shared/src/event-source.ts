import { z } from 'zod';
import { eventSchema, eventSourceKeySchema } from './event.js';

/** Shortest polling interval an admin may set: the feeds refresh about once a minute (D5). */
export const MIN_POLL_INTERVAL_SEC = 30;
export const MAX_POLL_INTERVAL_SEC = 24 * 60 * 60;
/** Longest Freshness Window an admin may set (D15); the default is 6 h. */
export const MAX_FRESHNESS_HOURS = 30 * 24;

/** An Event as stored: the normalised Event plus its database id. */
export const storedEventSchema = eventSchema.extend({ id: z.string().min(1) });
export type StoredEvent = z.infer<typeof storedEventSchema>;

export const eventSourceSchema = z.object({
  id: z.string().min(1),
  key: eventSourceKeySchema,
  name: z.string(),
  enabled: z.boolean(),
  /** Null for a source that is never polled (the Simulated Source). */
  intervalSec: z.number().int().nullable(),
  freshnessHours: z.number().int(),
  lastPollAt: z
    .union([z.date(), z.iso.datetime({ offset: true }).transform((s) => new Date(s))])
    .nullable(),
  lastError: z.string().nullable(),
});
export type EventSource = z.infer<typeof eventSourceSchema>;

/** What an admin may change on an Event Source (D5, D10). At least one field. */
export const eventSourceUpdateSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    intervalSec: z.number().int().min(MIN_POLL_INTERVAL_SEC).max(MAX_POLL_INTERVAL_SEC).optional(),
    freshnessHours: z.number().int().min(1).max(MAX_FRESHNESS_HOURS).optional(),
  })
  .refine((update) => Object.keys(update).length > 0, {
    message: 'Nothing to update',
  });
export type EventSourceUpdate = z.infer<typeof eventSourceUpdateSchema>;

/**
 * What an admin submits to create or change an Event of the Simulated Source (D10).
 * `occurredAt` defaults to "now" on create and to the stored value on update.
 */
export const simulatedEventInputSchema = eventSchema
  .pick({ category: true, severity: true, title: true, summary: true, location: true, url: true })
  .extend({ occurredAt: eventSchema.shape.occurredAt.optional() });
export type SimulatedEventInput = z.infer<typeof simulatedEventInputSchema>;

/** Outcome of one poll of one Event Source ("poll now" answers with it). */
export const pollResultSchema = z.object({
  source: eventSourceKeySchema,
  /** Items in the feed response, before filtering. */
  fetched: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  /** Items dropped on purpose, e.g. GDACS earthquakes (D15) or USGS quarry blasts. */
  ignored: z.number().int(),
  /** Items that could not be turned into a valid Event. */
  skipped: z.number().int(),
  /** Valid Events that failed to store. */
  failed: z.number().int(),
  /** Also stored as the source's `lastError`; null when everything went through. */
  error: z.string().nullable(),
});
export type PollResult = z.infer<typeof pollResultSchema>;
