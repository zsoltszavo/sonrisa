import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', database: 'up' })).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('rejects an unknown database state', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', database: 'maybe' }).success).toBe(false);
  });
});

describe('healthResponseSchema contradictions', () => {
  it('rejects status "ok" with database "down"', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', database: 'down' }).success).toBe(false);
  });
});
