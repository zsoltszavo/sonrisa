import type { AlertRule, Event } from './event.js';
import { containsPhrase, normalisedVariants } from './text.js';

export type MatchableRule = Pick<AlertRule, 'category' | 'minSeverity' | 'keywords'>;
export type MatchableEvent = Pick<
  Event,
  'category' | 'severity' | 'title' | 'summary' | 'location'
>;

/**
 * Builds a matcher for one Event, normalising its text once so many rules can be checked cheaply.
 *
 * Keyword filter (D4): any Keyword (OR) appears as a whole word or phrase in the Event's
 * title, summary or location, ignoring case and accents. No Keywords = no filter.
 * Each field is searched on its own, so a phrase can't span two fields. Apostrophes are tried
 * both as part of a word and as a word break ("Papaikou" and "Ivoire" both match).
 */
export function eventMatcher(event: MatchableEvent): (rule: MatchableRule) => boolean {
  const fields = [event.title, event.summary, event.location].flatMap(normalisedVariants);
  const matchesKeywords = (keywords: readonly string[]): boolean =>
    keywords.length === 0 ||
    keywords
      .flatMap(normalisedVariants)
      .some((phrase) => fields.some((field) => containsPhrase(field, phrase)));

  return (rule) =>
    rule.category === event.category &&
    event.severity >= rule.minSeverity &&
    matchesKeywords(rule.keywords);
}

/** Whether an Event is a Match for an Alert Rule: same Category, Severity at or above the minimum, Keywords (D3, D4). */
export function matches(rule: MatchableRule, event: MatchableEvent): boolean {
  return eventMatcher(event)(rule);
}
