import type { Event } from '@sonrisa/shared';
import { describe, expect, it } from 'vitest';
import { contentHash } from './content-hash.js';

const event: Event = {
  source: 'usgs',
  externalId: 'us1',
  category: 'earthquake',
  severity: 3,
  title: 'M 5.0 - Somewhere',
  summary: 'Magnitude 5',
  location: 'Somewhere',
  url: 'https://example.org/us1',
  occurredAt: new Date('2026-10-04T12:00:00Z'),
};

describe('contentHash', () => {
  it('is stable for the same content', () => {
    expect(contentHash({ ...event })).toBe(contentHash(event));
  });

  it.each([
    ['severity', { severity: 4 }],
    ['title', { title: 'M 5.1 - Somewhere' }],
    ['summary', { summary: 'Magnitude 5.1' }],
    ['location', { location: 'Elsewhere' }],
    ['url', { url: null }],
    ['occurredAt', { occurredAt: new Date('2026-10-04T12:00:01Z') }],
  ] as const)('changes when %s changes', (_field, change) => {
    expect(contentHash({ ...event, ...change })).not.toBe(contentHash(event));
  });

  it('ignores identity fields (they are the lookup key)', () => {
    expect(contentHash({ ...event, externalId: 'us2' })).toBe(contentHash(event));
  });

  it('does not confuse field boundaries', () => {
    const a = { ...event, title: 'a', summary: 'b c' };
    const b = { ...event, title: 'a b', summary: 'c' };
    expect(contentHash(a)).not.toBe(contentHash(b));
  });
});
