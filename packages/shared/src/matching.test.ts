import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { eventArb, ruleArb, severityArb } from './arbitraries.test-util.js';
import { matches, type MatchableEvent, type MatchableRule } from './matching.js';

const quake: MatchableEvent = {
  category: 'earthquake',
  severity: 2,
  title: 'M 2.0 - 3 km ENE of Pāpa‘ikou, Hawaii',
  summary: '',
  location: '3 km ENE of Pāpa‘ikou, Hawaii',
};
const rule = (overrides: Partial<MatchableRule> = {}): MatchableRule => ({
  category: 'earthquake',
  minSeverity: 1,
  keywords: [],
  ...overrides,
});

describe('matches — Category and Severity', () => {
  it('matches on Category and Severity alone when there are no Keywords', () => {
    expect(matches(rule(), quake)).toBe(true);
  });

  it('requires the same Category', () => {
    expect(matches(rule({ category: 'disaster' }), quake)).toBe(false);
  });

  it('includes the minimum Severity itself', () => {
    expect(matches(rule({ minSeverity: 2 }), quake)).toBe(true);
    expect(matches(rule({ minSeverity: 3 }), quake)).toBe(false);
  });
});

describe('matches — Keywords (D4)', () => {
  const disaster: MatchableEvent = {
    category: 'disaster',
    severity: 5,
    title: 'Red notification for tropical cyclone POLO-26.',
    summary: 'Market turmoil in São Paulo after the storm',
    location: 'Côte d’Ivoire',
  };
  const kw = (...keywords: string[]) => rule({ category: 'disaster', keywords });

  it.each([
    ['ignores case', ['CYCLONE'], true],
    ['ignores accents written by the user', ['são paulo'], true],
    ['ignores accents missing from the user’s keyword', ['sao paulo'], true],
    ['ignores an apostrophe / ʻokina inside a word', ['cote divoire'], true],
    ['matches a word split by a hyphen in the feed', ['polo'], true],
    ['matches the hyphenated form too', ['POLO-26'], true],
    ['matches a phrase', ['tropical cyclone'], true],
    ['does not match a substring', ['oil'], false],
    ['does not match a word prefix', ['cycl'], false],
    ['does not match a phrase with words out of order', ['cyclone tropical'], false],
    ['does not match a phrase across two fields', ['polo 26 market'], false],
    ['searches the summary', ['turmoil'], true],
    ['searches the location', ['ivoire'], true],
    ['reads an elision apostrophe as a word break', ["d'ivoire"], true],
    ['is OR across keywords', ['volcano', 'storm'], true],
    ['fails when no keyword matches', ['volcano', 'tsunami'], false],
  ])('%s: %j → %s', (_label, keywords, expected) => {
    expect(matches(kw(...keywords), disaster)).toBe(expected);
  });

  it('matches USGS place names typed without diacritics (saved sample)', () => {
    expect(matches(rule({ keywords: ['Papaikou'] }), quake)).toBe(true);
    expect(matches(rule({ keywords: ['hawaii'] }), quake)).toBe(true);
    expect(matches(rule({ keywords: ['ikou'] }), quake)).toBe(true); // apostrophe read as a word break
    expect(matches(rule({ keywords: ['paikou'] }), quake)).toBe(false);
  });

  it('never matches with a keyword that has no letters or digits', () => {
    expect(matches(rule({ keywords: ['!!!'] }), quake)).toBe(false);
  });
});

describe('matches — properties', () => {
  it('a higher minimum Severity never matches more Events', () => {
    fc.assert(
      fc.property(ruleArb, severityArb, eventArb, (r, higher, event) => {
        fc.pre(higher >= r.minSeverity);
        if (matches({ ...r, minSeverity: higher }, event)) expect(matches(r, event)).toBe(true);
      }),
    );
  });

  it('adding a Keyword to a non-empty list never matches fewer Events (OR)', () => {
    fc.assert(
      fc.property(ruleArb, fc.string(), eventArb, (r, extra, event) => {
        fc.pre(r.keywords.length > 0);
        if (matches(r, event)) {
          expect(matches({ ...r, keywords: [...r.keywords, extra] }, event)).toBe(true);
        }
      }),
    );
  });

  it('a Keyword match implies the rule without Keywords matches too', () => {
    fc.assert(
      fc.property(ruleArb, eventArb, (r, event) => {
        if (matches(r, event)) expect(matches({ ...r, keywords: [] }, event)).toBe(true);
      }),
    );
  });

  it('is unaffected by the case or accents of the Event text', () => {
    fc.assert(
      fc.property(ruleArb, eventArb, (r, event) => {
        const shouted = {
          ...event,
          title: event.title.toUpperCase(),
          summary: event.summary.toUpperCase(),
          location: event.location.toUpperCase(),
        };
        expect(matches(r, shouted)).toBe(matches(r, event));
      }),
    );
  });
});
