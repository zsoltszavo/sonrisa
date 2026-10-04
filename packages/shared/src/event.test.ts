import { describe, expect, it } from 'vitest';
import { alertRuleInputSchema, channelDestinationBaseSchema, eventSchema } from './event.js';

const validRule = { category: 'earthquake', minSeverity: 4, keywords: [], destinationIds: ['d1'] };

describe('alertRuleInputSchema', () => {
  it('accepts a rule with no Keywords', () => {
    expect(alertRuleInputSchema.parse(validRule)).toEqual(validRule);
  });

  it('trims Keywords', () => {
    expect(alertRuleInputSchema.parse({ ...validRule, keywords: ['  tokyo '] }).keywords).toEqual([
      'tokyo',
    ]);
  });

  it.each([
    ['a Severity outside 1–5', { minSeverity: 6 }],
    ['a fractional Severity', { minSeverity: 2.5 }],
    ['an unknown Category', { category: 'weather' }],
    ['no destinations', { destinationIds: [] }],
    ['the same destination twice', { destinationIds: ['d1', 'd1'] }],
    ['a blank Keyword', { keywords: ['   '] }],
    ['a Keyword with no letters or digits', { keywords: ['!!!'] }],
    ['Keywords equal after normalising', { keywords: ['São Paulo', 'sao  paulo'] }],
    ['Keywords differing only in apostrophe style', { keywords: ["L'Aquila", 'L´Aquila'] }],
  ])('rejects %s', (_label, override) => {
    expect(alertRuleInputSchema.safeParse({ ...validRule, ...override }).success).toBe(false);
  });
});

describe('eventSchema', () => {
  const validEvent = {
    source: 'usgs',
    externalId: 'nn00925263',
    category: 'earthquake',
    severity: 1,
    title: 'M 1.6 - 37 km N of Sutcliffe, Nevada',
    summary: '',
    location: '37 km N of Sutcliffe, Nevada',
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nn00925263',
    occurredAt: '2026-10-04T10:08:11.592Z',
  };

  it('parses an ISO date string into a Date', () => {
    expect(eventSchema.parse(validEvent).occurredAt).toEqual(new Date('2026-10-04T10:08:11.592Z'));
  });

  it.each([
    ['an invalid date', { occurredAt: 'yesterday' }],
    ['a null date (would coerce to 1970)', { occurredAt: null }],
    ['a javascript: URL', { url: 'javascript:alert(1)' }],
    ['a data: URL', { url: 'data:text/html,<script>alert(1)</script>' }],
  ])('rejects %s', (_label, override) => {
    expect(eventSchema.safeParse({ ...validEvent, ...override }).success).toBe(false);
  });

  it('accepts a Date object and a missing URL', () => {
    const occurredAt = new Date('2026-10-04T10:00:00Z');
    expect(eventSchema.parse({ ...validEvent, occurredAt, url: null }).occurredAt).toBe(occurredAt);
  });
});

describe('channelDestinationBaseSchema', () => {
  it('accepts a Channel key that is not built in yet', () => {
    const destination = {
      id: 'd1',
      userId: 'u1',
      channel: 'webhook',
      label: 'Ops hook',
      config: {},
    };
    expect(channelDestinationBaseSchema.safeParse(destination).success).toBe(true);
  });
});
