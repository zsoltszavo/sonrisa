import { eventSchema } from '@sonrisa/shared';
import { describe, expect, it } from 'vitest';
import { readFeedSample } from './feed-samples.test-util.js';
import { parseGdacsFeed } from './gdacs.adapter.js';

const sample = readFeedSample('gdacs');

/** A one-item feed built from the first item of the sample, with tags replaced. */
function singleItem(replace: (item: string) => string): string {
  const item = /<item>[\s\S]*?<\/item>/.exec(sample)?.[0];
  if (!item) throw new Error('sample has no <item>');
  return sample.replace(/<item>[\s\S]*<\/item>/, replace(item));
}

describe('parseGdacsFeed (saved sample)', () => {
  const batch = parseGdacsFeed(sample);

  it('reads all 179 items and drops the 5 earthquakes (USGS owns them, D15)', () => {
    expect(batch.fetched).toBe(179);
    expect(batch.ignored).toBe(5);
    expect(batch.events).toHaveLength(174);
    expect(batch.skipped).toEqual([]);
    expect(batch.events.filter((event) => event.externalId.startsWith('EQ'))).toEqual([]);
    for (const event of batch.events) expect(eventSchema.parse(event)).toEqual(event);
  });

  it('maps the first item field by field, with occurredAt = dateadded (D15)', () => {
    const event = batch.events[0];
    expect(event?.summary).toMatch(/^On 05\/10\/2026, a flood started in Thailand/);
    expect(event).toEqual({
      source: 'gdacs',
      externalId: 'FL1104169',
      category: 'disaster',
      severity: 2,
      title: 'Green flood alert in Thailand',
      summary: event?.summary,
      location: 'Thailand',
      // `&amp;` in the XML is decoded.
      url: 'https://www.gdacs.org/report.aspx?eventtype=FL&eventid=1104169',
      // dateadded "Sun, 04 Oct 2026 11:18:58 GMT", not fromdate (5 Oct, in the future).
      occurredAt: new Date('2026-10-04T11:18:58Z'),
    });
  });

  it('maps alert levels through the shared mapper: Green→2, Orange→4, Red→5', () => {
    const red = batch.events.find((event) => event.externalId === 'TC1001325');
    expect(red).toMatchObject({ severity: 5, location: 'Mexico' });
    expect(new Set(batch.events.map((event) => event.severity))).toEqual(new Set([2, 4, 5]));
  });

  it('keeps an item with no country, with an empty location', () => {
    expect(batch.events.filter((event) => event.location === '')).toHaveLength(2);
  });
});

describe('parseGdacsFeed (edge cases)', () => {
  it('still gives an array for a feed with a single item', () => {
    const batch = parseGdacsFeed(singleItem((item) => item));
    expect(batch.events.map((event) => event.externalId)).toEqual(['FL1104169']);
  });

  it('keeps an all-digit guid a string', () => {
    const batch = parseGdacsFeed(singleItem((item) => item.replace('>FL1104169<', '>1104169<')));
    expect(batch.events[0]?.externalId).toBe('1104169');
  });

  it('reads a numeric offset as that offset, not as server-local time', () => {
    const batch = parseGdacsFeed(
      singleItem((item) =>
        item.replace(
          '<gdacs:dateadded>Sun, 04 Oct 2026 11:18:58 GMT',
          '<gdacs:dateadded>Sun, 04 Oct 2026 13:18:58 +0200',
        ),
      ),
    );
    expect(batch.events[0]?.occurredAt).toEqual(new Date('2026-10-04T11:18:58Z'));
  });

  it('skips an item whose date has no time zone', () => {
    const batch = parseGdacsFeed(
      singleItem((item) => item.replace(/(<gdacs:dateadded>[^<]*) GMT/, '$1')),
    );
    expect(batch.events).toEqual([]);
    expect(batch.skipped.map((item) => item.externalId)).toEqual(['FL1104169']);
    expect(batch.skipped[0]?.reason).not.toBe('');
  });

  it('skips an item with an unknown alert level', () => {
    const batch = parseGdacsFeed(
      singleItem((item) => item.replace('<gdacs:alertlevel>Green<', '<gdacs:alertlevel>Purple<')),
    );
    expect(batch.skipped.map((skipped) => skipped.externalId)).toEqual(['FL1104169']);
  });

  it('fails the whole poll on a body that is not RSS', () => {
    expect(() => parseGdacsFeed('<html><body>Maintenance</body></html>')).toThrow();
    expect(() => parseGdacsFeed('{"error":true}')).toThrow();
  });
});
