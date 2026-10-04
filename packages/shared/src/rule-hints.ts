import { type Category, type Severity } from './event.js';
import {
  gdacsAlertLevelSchema,
  severityFromGdacsAlertLevel,
  severityFromUsgsMagnitude,
} from './severity.js';

/**
 * Starter Keywords shown as chips in the rule form (D4). They are suggestions only: any
 * Keyword the user types works the same way.
 */
export const KEYWORD_SUGGESTIONS: Record<Category, readonly string[]> = {
  earthquake: ['Japan', 'California', 'Alaska', 'Indonesia', 'Chile', 'tsunami'],
  disaster: ['flood', 'cyclone', 'wildfire', 'volcano', 'drought', 'Philippines'],
  news: ['oil', 'OPEC', 'election', 'sanctions', 'strike', 'outage'],
  market: ['oil', 'gold', 'bitcoin', 'Nasdaq', 'interest rate', 'EUR/USD'],
};

/**
 * What "Severity ≥ `min`" means in the source's own terms, e.g. "M6 and above" for earthquakes.
 * Derived from the same mapping functions the adapters use, so the label can't drift from them.
 * `null` for Categories that only come from the Simulated Source, where an Admin sets Severity.
 */
export function severityHint(category: Category, min: Severity): string | null {
  switch (category) {
    case 'earthquake': {
      if (min === 1) return 'Any magnitude';
      // The adapter buckets on integer magnitude edges; find the first one that reaches `min`.
      for (let magnitude = 0; magnitude <= 10; magnitude++) {
        if (severityFromUsgsMagnitude(magnitude) >= min) return `M${String(magnitude)} and above`;
      }
      return null;
    }
    case 'disaster': {
      const levels = gdacsAlertLevelSchema.options.filter(
        (level) => severityFromGdacsAlertLevel(level) >= min,
      );
      return levels.length === gdacsAlertLevelSchema.options.length
        ? 'Every GDACS alert'
        : `GDACS ${levels.join(' or ')}`;
    }
    case 'news':
    case 'market':
      return null;
  }
}
