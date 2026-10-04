import { categorySchema, eventSourceKeySchema, severitySchema } from '@sonrisa/shared';
import { z } from 'zod';
import type { AdminEventFilters } from './api';

/** `datetime-local` values ("2026-10-04T18:30"), read as the browser's local time. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const EVENT_FILTER_KEYS = ['source', 'category', 'minSeverity', 'from', 'to'] as const;
export type EventFilterKey = (typeof EVENT_FILTER_KEYS)[number];

/**
 * Reads the filters from the URL (so a filtered view can be shared or reloaded), dropping anything
 * that isn't valid instead of sending the API a request it would refuse.
 */
export function filtersFrom(params: URLSearchParams): AdminEventFilters {
  return readFilters(params).filters;
}

/** True when both time bounds are valid but "from" is after "until"; the page says so. */
export function isRangeInverted(params: URLSearchParams): boolean {
  return readFilters(params).inverted;
}

function readFilters(params: URLSearchParams): { filters: AdminEventFilters; inverted: boolean } {
  const read = <T>(schema: z.ZodType<T>, key: EventFilterKey): T | undefined => {
    const result = schema.safeParse(params.get(key) ?? undefined);
    return result.success ? result.data : undefined;
  };
  // `to` covers its whole minute, so "until 18:30" includes an Event at 18:30:40.
  const toIso = (value: string | undefined, extraMs = 0) => {
    const date = value === undefined ? undefined : new Date(value);
    // The regex lets "2026-13-45T99:99" through; an invalid Date would throw in toISOString().
    return date && !Number.isNaN(date.getTime())
      ? new Date(date.getTime() + extraMs).toISOString()
      : undefined;
  };
  const from = toIso(read(localDateTime, 'from'));
  const to = toIso(read(localDateTime, 'to'), 59_999);
  // The API refuses from > to (400); the page explains instead of showing an error (CR63).
  const inverted = from !== undefined && to !== undefined && from > to;
  const filters: AdminEventFilters = {
    source: read(eventSourceKeySchema, 'source'),
    category: read(categorySchema, 'category'),
    minSeverity: read(z.coerce.number().pipe(severitySchema), 'minSeverity'),
    from: inverted ? undefined : from,
    to: inverted ? undefined : to,
  };
  return { filters, inverted };
}
