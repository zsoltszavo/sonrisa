import { Injectable } from '@nestjs/common';
import { gdacsAlertLevelSchema, severityFromGdacsAlertLevel } from '@sonrisa/shared';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import {
  type AdapterBatch,
  describeIssues,
  type EventSourceAdapter,
  FeedFetcher,
  isSkipped,
  toEvent,
} from './adapter.js';

export const GDACS_FEED_URL = 'https://www.gdacs.org/xml/rss.xml';

/**
 * RFC 822/1123 date as GDACS writes it ("Sun, 04 Oct 2026 11:18:58 GMT"). The zone is required:
 * without one, `new Date()` would read the time in the server's local zone.
 */
const rfc1123Date = z
  .string()
  .regex(/^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}(:\d{2})? (GMT|UTC|[+-]\d{4})$/, {
    message: 'Not an RFC 1123 date with a time zone',
  })
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), { message: 'Invalid date' });

const rssSchema = z.object({
  rss: z.object({
    channel: z.object({ item: z.array(z.unknown()).default([]) }),
  }),
});

/**
 * Prefixed names (`gdacs:eventtype`) are kept as written: the parser doesn't resolve namespaces,
 * and stripping prefixes could let a plain `<country>` shadow `<gdacs:country>`.
 */
const itemSchema = z.object({
  /** Event-level id, e.g. "FL1104169"; a new episode of the same event keeps it (→ Event Update). */
  guid: z.string().min(1),
  title: z.string(),
  description: z.string().default(''),
  link: z.string(),
  'gdacs:eventtype': z.string(),
  'gdacs:alertlevel': gdacsAlertLevelSchema,
  /** occurredAt (D15): `fromdate` can lie in the future and `datemodified` can be older than it. */
  'gdacs:dateadded': rfc1123Date,
  'gdacs:country': z.string().default(''),
});

const parser = new XMLParser({
  // Text values stay strings: otherwise an all-digit guid or title would turn into a number.
  parseTagValue: false,
  ignoreAttributes: true,
  // A feed with a single <item> must still give an array.
  isArray: (name) => name === 'item',
});

/** Parses the GDACS RSS feed. Pure, so tests run it against the saved sample. */
export function parseGdacsFeed(body: string): AdapterBatch {
  const items = rssSchema.parse(parser.parse(body)).rss.channel.item;
  const batch: AdapterBatch = { fetched: items.length, events: [], ignored: 0, skipped: [] };

  for (const raw of items) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      const guid = z.object({ guid: z.string() }).safeParse(raw);
      batch.skipped.push({
        externalId: guid.success ? guid.data.guid : null,
        reason: describeIssues(parsed.error),
      });
      continue;
    }
    const item = parsed.data;
    // USGS is the one authoritative source for earthquakes (D15).
    if (item['gdacs:eventtype'] === 'EQ') {
      batch.ignored += 1;
      continue;
    }
    const event = toEvent(
      {
        source: 'gdacs',
        externalId: item.guid,
        category: 'disaster',
        severity: severityFromGdacsAlertLevel(item['gdacs:alertlevel']),
        title: item.title.trim(),
        summary: item.description.trim(),
        location: item['gdacs:country'].trim(),
        url: item.link.trim(),
        occurredAt: item['gdacs:dateadded'],
      },
      item.guid,
    );
    if (isSkipped(event)) batch.skipped.push(event);
    else batch.events.push(event);
  }
  return batch;
}

@Injectable()
export class GdacsAdapter implements EventSourceAdapter {
  readonly key = 'gdacs';

  constructor(private readonly fetcher: FeedFetcher) {}

  async poll(signal: AbortSignal): Promise<AdapterBatch> {
    return parseGdacsFeed(await this.fetcher.fetchText(GDACS_FEED_URL, signal));
  }
}
