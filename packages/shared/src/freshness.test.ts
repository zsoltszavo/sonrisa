import { describe, expect, it } from 'vitest';
import { DEFAULT_FRESHNESS_HOURS, isFresh } from './freshness.js';

const now = new Date('2026-10-04T12:00:00Z');
const at = (iso: string) => ({ occurredAt: new Date(iso) });

describe('isFresh (D15)', () => {
  it('defaults to a 6 hour window', () => {
    expect(DEFAULT_FRESHNESS_HOURS).toBe(6);
  });

  it('includes an Event exactly at the window edge', () => {
    expect(isFresh(at('2026-10-04T06:00:00Z'), 6, now)).toBe(true);
  });

  it('excludes an Event one millisecond past the window', () => {
    expect(isFresh(at('2026-10-04T05:59:59.999Z'), 6, now)).toBe(false);
  });

  it('treats an Event dated in the future as fresh', () => {
    expect(isFresh(at('2026-10-05T01:00:00Z'), 6, now)).toBe(true);
  });
});
