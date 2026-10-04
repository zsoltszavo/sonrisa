import { describe, expect, it } from 'vitest';
import { isDue } from './polling.service.js';

const now = new Date('2026-10-04T12:00:00Z');
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('isDue', () => {
  it('is due when never polled', () => {
    expect(isDue({ enabled: true, intervalSec: 60, lastPollAt: null }, now)).toBe(true);
  });

  it('is due exactly when the interval has passed since the last poll, not before', () => {
    expect(isDue({ enabled: true, intervalSec: 60, lastPollAt: secondsAgo(59) }, now)).toBe(false);
    expect(isDue({ enabled: true, intervalSec: 60, lastPollAt: secondsAgo(60) }, now)).toBe(true);
  });

  it('is never due when disabled or never polled (Simulated Source)', () => {
    expect(isDue({ enabled: false, intervalSec: 60, lastPollAt: null }, now)).toBe(false);
    expect(isDue({ enabled: true, intervalSec: null, lastPollAt: null }, now)).toBe(false);
  });
});
