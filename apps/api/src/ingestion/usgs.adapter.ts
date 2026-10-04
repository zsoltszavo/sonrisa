import { Injectable } from '@nestjs/common';
import { severityFromUsgsMagnitude } from '@sonrisa/shared';
import { z } from 'zod';
import {
  type AdapterBatch,
  describeIssues,
  type EventSourceAdapter,
  FeedFetcher,
  isSkipped,
  toEvent,
} from './adapter.js';

/** Past-hour summary feed (the saved sample is this URL); polled every 60 s by default (D5). */
export const USGS_FEED_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';

const collectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.unknown()),
});

/** Only the fields we use, as documented for the GeoJSON summary format and seen in the sample. */
const featureSchema = z.object({
  id: z.string().min(1),
  properties: z.object({
    mag: z.number().nullable(),
    magType: z.string().nullable(),
    place: z.string().nullable(),
    /** Epoch milliseconds, UTC. */
    time: z.number(),
    url: z.string(),
    title: z.string(),
    /** "earthquake", "quarry blast", "explosion", ... */
    type: z.string(),
  }),
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number(), z.number()]) }).nullable(),
});

type Feature = z.infer<typeof featureSchema>;

function summaryOf({ properties, geometry }: Feature): string {
  const magnitude =
    properties.mag === null
      ? 'Magnitude unknown'
      : `Magnitude ${String(properties.mag)}${properties.magType ? ` (${properties.magType})` : ''}`;
  if (!geometry) return `${magnitude}.`;
  return `${magnitude}, depth ${geometry.coordinates[2].toFixed(1)} km.`;
}

/** Parses a USGS GeoJSON summary feed. Pure, so tests run it against the saved sample. */
export function parseUsgsFeed(body: string): AdapterBatch {
  // A body that isn't the expected FeatureCollection fails the whole poll (recorded as lastError).
  const collection = collectionSchema.parse(JSON.parse(body));
  const batch: AdapterBatch = {
    fetched: collection.features.length,
    events: [],
    ignored: 0,
    skipped: [],
  };

  for (const raw of collection.features) {
    const parsed = featureSchema.safeParse(raw);
    if (!parsed.success) {
      const id = z.object({ id: z.string() }).safeParse(raw);
      batch.skipped.push({
        externalId: id.success ? id.data.id : null,
        reason: describeIssues(parsed.error),
      });
      continue;
    }
    const feature = parsed.data;
    // USGS owns the earthquake Category (D15); quarry blasts and explosions are not earthquakes.
    if (feature.properties.type !== 'earthquake') {
      batch.ignored += 1;
      continue;
    }
    const event = toEvent(
      {
        source: 'usgs',
        externalId: feature.id,
        category: 'earthquake',
        severity: severityFromUsgsMagnitude(feature.properties.mag),
        title: feature.properties.title,
        summary: summaryOf(feature),
        location: feature.properties.place ?? '',
        url: feature.properties.url,
        occurredAt: new Date(feature.properties.time),
      },
      feature.id,
    );
    if (isSkipped(event)) batch.skipped.push(event);
    else batch.events.push(event);
  }
  return batch;
}

@Injectable()
export class UsgsAdapter implements EventSourceAdapter {
  readonly key = 'usgs';

  constructor(private readonly fetcher: FeedFetcher) {}

  async poll(signal: AbortSignal): Promise<AdapterBatch> {
    return parseUsgsFeed(await this.fetcher.fetchText(USGS_FEED_URL, signal));
  }
}
