import { z } from 'zod';
import type { Severity } from './event.js';

/**
 * USGS magnitude → Severity on integer edges (ADR 0001): <4→1, 4–4.9→2, 5–5.9→3, 6–6.9→4, ≥7→5.
 *
 * The magnitude is first rounded to one decimal, the precision USGS shows in its titles
 * ("M 6.0"), so an Event titled M 6.0 is never placed below the M6 edge because its raw value
 * is 5.96 (D18). `null` (USGS sends it for some events) maps to the lowest Severity.
 */
export function severityFromUsgsMagnitude(magnitude: number | null): Severity {
  if (magnitude === null || !Number.isFinite(magnitude)) return 1;
  const displayed = Math.round(magnitude * 10) / 10;
  if (displayed >= 7) return 5;
  if (displayed >= 6) return 4;
  if (displayed >= 5) return 3;
  if (displayed >= 4) return 2;
  return 1;
}

export const gdacsAlertLevelSchema = z.enum(['Green', 'Orange', 'Red']);
export type GdacsAlertLevel = z.infer<typeof gdacsAlertLevelSchema>;

const GDACS_SEVERITY = { Green: 2, Orange: 4, Red: 5 } as const satisfies Record<
  GdacsAlertLevel,
  Severity
>;

/** GDACS alert level → Severity (D15): Green→2, Orange→4, Red→5. */
export function severityFromGdacsAlertLevel(level: GdacsAlertLevel): Severity {
  return GDACS_SEVERITY[level];
}
