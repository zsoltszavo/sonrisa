import { z } from 'zod';

/**
 * Response of `GET /api/health`: the API is up and can reach Postgres.
 * A union, so contradictory states like `{ status: 'ok', database: 'down' }` can't be expressed.
 */
export const healthResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), database: z.literal('up') }),
  z.object({ status: z.literal('error'), database: z.literal('down') }),
]);

export type HealthResponse = z.infer<typeof healthResponseSchema>;
