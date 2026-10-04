import { describe, expect, it } from 'vitest';
import { categorySchema, keywordsSchema, SEVERITIES } from './event.js';
import { KEYWORD_SUGGESTIONS, severityHint } from './rule-hints.js';

describe('severityHint', () => {
  it('names the USGS magnitude edge each earthquake Severity starts at', () => {
    expect(SEVERITIES.map((s) => severityHint('earthquake', s))).toEqual([
      'Any magnitude',
      'M4 and above',
      'M5 and above',
      'M6 and above',
      'M7 and above',
    ]);
  });

  it('names the GDACS alert levels a disaster Severity lets through', () => {
    expect(SEVERITIES.map((s) => severityHint('disaster', s))).toEqual([
      'Every GDACS alert',
      'Every GDACS alert',
      'GDACS Orange or Red',
      'GDACS Orange or Red',
      'GDACS Red',
    ]);
  });

  it('has no hint for Categories whose Severity an Admin sets', () => {
    expect(severityHint('news', 3)).toBeNull();
    expect(severityHint('market', 3)).toBeNull();
  });
});

describe('KEYWORD_SUGGESTIONS', () => {
  it.each(categorySchema.options)('offers valid, distinct Keywords for %s', (category) => {
    const suggestions = KEYWORD_SUGGESTIONS[category];
    expect(suggestions.length).toBeGreaterThan(0);
    expect(keywordsSchema.safeParse(suggestions).success).toBe(true);
  });
});
