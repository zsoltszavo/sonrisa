import { type Category, eventMatcher, type Severity } from '@sonrisa/shared';
import { useDeferredValue, useMemo } from 'react';
import { CATEGORY_LABELS } from './labels';
import { useRecentEvents } from './queries';

/**
 * Live preview data (D14): the shared `eventMatcher` (what `matches()` and the server use) over
 * recent Events. Each Event is normalised once per fetch; only the rule part re-runs per change,
 * and on deferred values so typing never waits on the filter.
 */
export function useRulePreview(category: Category, minSeverity: Severity, keywords: string[]) {
  const events = useRecentEvents(category);
  const matchers = useMemo(
    () => (events.data ?? []).map((event) => ({ event, test: eventMatcher(event) })),
    [events.data],
  );
  const deferredSeverity = useDeferredValue(minSeverity);
  const deferredKeywords = useDeferredValue(keywords);
  const matched = useMemo(() => {
    const rule = { category, minSeverity: deferredSeverity, keywords: deferredKeywords };
    return matchers.filter(({ test }) => test(rule)).map(({ event }) => event);
  }, [matchers, category, deferredSeverity, deferredKeywords]);
  return { events, matched, categoryName: CATEGORY_LABELS[category].toLowerCase() };
}

export type RulePreviewData = ReturnType<typeof useRulePreview>;
