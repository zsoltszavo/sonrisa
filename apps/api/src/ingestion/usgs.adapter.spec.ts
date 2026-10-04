import { eventSchema } from '@sonrisa/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readFeedSample } from './feed-samples.test-util.js';
import { parseUsgsFeed } from './usgs.adapter.js';

const sample = readFeedSample('usgs');

/** The sample with one feature's properties changed. */
function withFeature(id: string, change: Record<string, unknown>): string {
  const feed = z
    .looseObject({
      features: z.array(z.looseObject({ id: z.string(), properties: z.looseObject({}) })),
    })
    .parse(JSON.parse(sample));
  for (const feature of feed.features) {
    if (feature.id === id) feature.properties = { ...feature.properties, ...change };
  }
  return JSON.stringify(feed);
}

describe('parseUsgsFeed (saved sample)', () => {
  const batch = parseUsgsFeed(sample);

  it('turns every feature of the sample into a valid Event', () => {
    expect(batch.fetched).toBe(5);
    expect(batch.events).toHaveLength(5);
    expect(batch.skipped).toEqual([]);
    expect(batch.ignored).toBe(0);
    for (const event of batch.events) expect(eventSchema.parse(event)).toEqual(event);
  });

  it('maps the M5.0 Panama quake field by field', () => {
    const event = batch.events.find((e) => e.externalId === 'us6000tzj8');
    expect(event?.summary).toMatch(/^Magnitude 5 \(\w+\), depth \d+\.\d km\.$/);
    expect(event).toEqual({
      source: 'usgs',
      externalId: 'us6000tzj8',
      category: 'earthquake',
      severity: 3,
      title: 'M 5.0 - 295 km S of Burica, Panama',
      summary: event?.summary,
      location: '295 km S of Burica, Panama',
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000tzj8',
      // `time` is epoch milliseconds in UTC.
      occurredAt: new Date(1791122770385),
    });
  });

  it('keeps ʻokina place names as written (matching folds them, D18(b))', () => {
    expect(batch.events.map((event) => event.location)).toContain('3 km ENE of Pāpa‘ikou, Hawaii');
  });

  it('maps magnitudes through the shared severity mapper', () => {
    expect(batch.events.map((event) => event.severity)).toEqual([1, 1, 1, 3, 1]);
  });
});

describe('parseUsgsFeed (edge cases)', () => {
  it('ignores non-earthquakes (USGS also lists quarry blasts)', () => {
    const batch = parseUsgsFeed(withFeature('nn00925263', { type: 'quarry blast' }));
    expect(batch.ignored).toBe(1);
    expect(batch.events.map((event) => event.externalId)).not.toContain('nn00925263');
  });

  it('accepts a null magnitude as Severity 1', () => {
    const batch = parseUsgsFeed(withFeature('us6000tzj8', { mag: null }));
    const event = batch.events.find((e) => e.externalId === 'us6000tzj8');
    expect(event?.severity).toBe(1);
    expect(event?.summary).toMatch(/^Magnitude unknown/);
  });

  it('accepts a null place as an empty location', () => {
    const batch = parseUsgsFeed(withFeature('us6000tzj8', { place: null }));
    expect(batch.events.find((e) => e.externalId === 'us6000tzj8')?.location).toBe('');
  });

  it('skips a malformed feature without losing the rest', () => {
    const batch = parseUsgsFeed(withFeature('us6000tzj8', { time: 'yesterday' }));
    expect(batch.events).toHaveLength(4);
    expect(batch.skipped.map((item) => item.externalId)).toEqual(['us6000tzj8']);
    expect(batch.skipped[0]?.reason).not.toBe('');
  });

  it('skips a non-http(s) link instead of storing it (eventSchema)', () => {
    const batch = parseUsgsFeed(withFeature('us6000tzj8', { url: 'javascript:alert(1)' }));
    expect(batch.skipped.map((item) => item.externalId)).toEqual(['us6000tzj8']);
  });

  it('fails the whole poll on a body that is not a FeatureCollection', () => {
    expect(() => parseUsgsFeed('<html>Service Unavailable</html>')).toThrow();
    expect(() => parseUsgsFeed('{"type":"Feature"}')).toThrow();
  });
});
