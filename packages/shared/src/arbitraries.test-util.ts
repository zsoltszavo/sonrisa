import fc from 'fast-check';
import type { Category, Severity } from './event.js';
import type { MatchableEvent, MatchableRule } from './matching.js';

const WORDS = ['oil', 'turmoil', 'São', 'Paulo', 'quake', 'flood', 'POLO-26', 'Pāhala', 'fire'];

export const severityArb = fc.constantFrom<Severity>(1, 2, 3, 4, 5);
export const categoryArb = fc.constantFrom<Category>('earthquake', 'disaster', 'news', 'market');
const textArb = fc.array(fc.constantFrom(...WORDS), { maxLength: 6 }).map((w) => w.join(' '));

export const eventArb: fc.Arbitrary<MatchableEvent> = fc.record({
  category: categoryArb,
  severity: severityArb,
  title: textArb,
  summary: textArb,
  location: textArb,
});

export const ruleArb: fc.Arbitrary<MatchableRule> = fc.record({
  category: categoryArb,
  minSeverity: severityArb,
  keywords: fc.uniqueArray(fc.constantFrom(...WORDS, 'sao paulo', 'pahala'), { maxLength: 3 }),
});
