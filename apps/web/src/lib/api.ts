import { healthResponseSchema, type HealthResponse } from '@sonrisa/shared';

/**
 * GET /api/health. A 503 still carries a valid body (`database: "down"`),
 * so we parse it instead of treating every non-2xx as an unknown failure.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  if (!response.ok && response.status !== 503) {
    throw new Error(`Health check failed: HTTP ${String(response.status)}`);
  }
  return healthResponseSchema.parse(await response.json());
}
