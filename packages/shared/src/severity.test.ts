/// <reference types="node" />
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  gdacsAlertLevelSchema,
  severityFromGdacsAlertLevel,
  severityFromUsgsMagnitude,
} from './severity.js';

const sample = (name: string): string =>
  readFileSync(new URL(`../../../docs/evidence/feed-samples/${name}`, import.meta.url), 'utf8');

describe('severityFromUsgsMagnitude', () => {
  it.each([
    [-0.8, 1],
    [0, 1],
    [3.9, 1],
    [3.94, 1],
    [3.95, 2],
    [4, 2],
    [4.9, 2],
    [5, 3],
    [5.9, 3],
    [5.94, 3],
    [5.95, 4],
    [5.96, 4],
    [6, 4],
    [6.0000001, 4],
    [6.9, 4],
    [7, 5],
    [9.5, 5],
  ])('M%s → %i', (magnitude, expected) => {
    expect(severityFromUsgsMagnitude(magnitude)).toBe(expected);
  });

  it('maps a missing magnitude to the lowest Severity', () => {
    expect(severityFromUsgsMagnitude(null)).toBe(1);
    expect(severityFromUsgsMagnitude(Number.NaN)).toBe(1);
  });

  it('never decreases as magnitude grows', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2, max: 10, noNaN: true }),
        fc.double({ min: -2, max: 10, noNaN: true }),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(severityFromUsgsMagnitude(lo)).toBeLessThanOrEqual(severityFromUsgsMagnitude(hi));
        },
      ),
    );
  });

  it('agrees with the magnitude USGS shows in its titles (saved sample)', () => {
    interface Feature {
      properties: { mag: number | null; title: string };
    }
    const { features } = JSON.parse(sample('usgs-all-hour-2026-10-04.geojson')) as {
      features: Feature[];
    };
    expect(features.length).toBeGreaterThan(0);
    for (const { properties } of features) {
      const shown = Number(/^M (-?\d+\.\d)/.exec(properties.title)?.[1]);
      expect(severityFromUsgsMagnitude(properties.mag)).toBe(severityFromUsgsMagnitude(shown));
    }
  });
});

describe('severityFromGdacsAlertLevel', () => {
  it('maps Green→2, Orange→4, Red→5', () => {
    expect(severityFromGdacsAlertLevel('Green')).toBe(2);
    expect(severityFromGdacsAlertLevel('Orange')).toBe(4);
    expect(severityFromGdacsAlertLevel('Red')).toBe(5);
  });

  it('covers every alert level in the saved GDACS sample', () => {
    const levels = [
      ...sample('gdacs-rss-2026-10-04.xml').matchAll(/<gdacs:alertlevel>([^<]*)</g),
    ].map((m) => m[1]);
    expect(new Set(levels)).toEqual(new Set(['Green', 'Orange', 'Red']));
    for (const level of levels) expect(gdacsAlertLevelSchema.safeParse(level).success).toBe(true);
  });

  it('rejects an unknown level instead of guessing', () => {
    expect(gdacsAlertLevelSchema.safeParse('green').success).toBe(false);
    expect(gdacsAlertLevelSchema.safeParse('Yellow').success).toBe(false);
  });
});
