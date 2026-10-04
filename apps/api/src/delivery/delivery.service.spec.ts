import { describe, expect, it } from 'vitest';
import { MAX_RETRY_DELAY_SECONDS, retryDelaySeconds } from './delivery.service.js';

describe('retryDelaySeconds', () => {
  it('doubles the base delay per attempt (exponential backoff)', () => {
    expect([1, 2, 3].map((attempt) => retryDelaySeconds(attempt, 30, null))).toEqual([30, 60, 120]);
  });

  it('waits at least as long as Retry-After asks, never shorter than the backoff', () => {
    expect(retryDelaySeconds(1, 30, 90)).toBe(90);
    expect(retryDelaySeconds(2, 30, 5)).toBe(60);
  });

  it('caps both at an hour', () => {
    expect(retryDelaySeconds(1, 30, 86_400)).toBe(MAX_RETRY_DELAY_SECONDS);
    expect(retryDelaySeconds(20, 30, null)).toBe(MAX_RETRY_DELAY_SECONDS);
  });
});
