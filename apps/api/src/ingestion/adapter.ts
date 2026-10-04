import { Injectable } from '@nestjs/common';
import { type Event, eventSchema, type EventSourceKey } from '@sonrisa/shared';
import type { z } from 'zod';

/** An item of a feed that could not become a valid Event. */
export interface SkippedItem {
  externalId: string | null;
  reason: string;
}

/** What one feed response turned into. */
export interface AdapterBatch {
  /** Items in the response, before filtering. */
  fetched: number;
  events: Event[];
  /** Dropped on purpose (GDACS earthquakes, D15; USGS non-earthquakes). */
  ignored: number;
  skipped: SkippedItem[];
}

/**
 * Turns one Event Source's raw data into Events (D2). Every adapter builds its Events through
 * the shared `eventSchema`, so nothing invalid reaches the database or the matcher.
 */
export interface EventSourceAdapter {
  readonly key: EventSourceKey;
  /** Fetches the source's current Events. A source nobody polls (Simulated) returns an empty batch. */
  poll(signal: AbortSignal): Promise<AdapterBatch>;
}

export const emptyBatch = (): AdapterBatch => ({ fetched: 0, events: [], ignored: 0, skipped: [] });

/** One readable reason for every adapter: "field.path: message; ...". */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

/** Validates a candidate Event; an invalid one becomes a SkippedItem instead of failing the batch. */
export function toEvent(candidate: unknown, externalId: string | null): Event | SkippedItem {
  const result = eventSchema.safeParse(candidate);
  if (result.success) return result.data;
  return { externalId, reason: describeIssues(result.error) };
}

/**
 * Keeps one Event per externalId (the last one in the response). Without this, two items with
 * the same id would overwrite each other on every poll, and each overwrite is an Event Update
 * (review CR33). The dropped ones are reported as skipped.
 */
export function dedupeByExternalId(events: Event[]): {
  events: Event[];
  duplicates: SkippedItem[];
} {
  const last = new Map<string, Event>();
  const duplicates: SkippedItem[] = [];
  for (const event of events) {
    if (last.has(event.externalId)) {
      duplicates.push({
        externalId: event.externalId,
        reason: 'the same id appears more than once in one response; the last one was kept',
      });
    }
    last.set(event.externalId, event);
  }
  return { events: [...last.values()], duplicates };
}

export function isSkipped(value: Event | SkippedItem): value is SkippedItem {
  return 'reason' in value;
}

/** HTTP access for the polled adapters; e2e tests replace it with the saved feed samples. */
@Injectable()
export class FeedFetcher {
  async fetchText(url: string, signal: AbortSignal): Promise<string> {
    const response = await fetch(url, {
      signal,
      headers: { 'user-agent': 'sonrisa-world-event-alerts/0.1' },
    });
    if (!response.ok) {
      throw new Error(`${url} answered HTTP ${String(response.status)}`);
    }
    return response.text();
  }
}
