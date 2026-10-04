import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { severityArb } from './arbitraries.test-util.js';
import type { AlertRule, Severity } from './event.js';
import type { MatchableEvent } from './matching.js';
import {
  decideNotifications,
  type DecideNotificationsInput,
  type NotifiedRecipient,
} from './notifications.js';

const event = (severity: Severity, title = 'M 5.8 - near Tokyo'): MatchableEvent => ({
  category: 'earthquake',
  severity,
  title,
  summary: '',
  location: '',
});

const rule = (overrides: Partial<AlertRule> & Pick<AlertRule, 'id'>): AlertRule => ({
  userId: 'alice',
  category: 'earthquake',
  minSeverity: 1,
  keywords: [],
  destinationIds: ['alice-email'],
  ...overrides,
});

const decide = (input: Partial<DecideNotificationsInput>) =>
  decideNotifications({ event: event(3), rules: [], alreadyNotified: [], ...input });

describe('decideNotifications — new Events', () => {
  it('sends a match to each destination of a matching rule', () => {
    const rules = [rule({ id: 'r1', destinationIds: ['alice-email', 'alice-slack'] })];
    expect(decide({ rules })).toEqual([
      { userId: 'alice', destinationId: 'alice-email', kind: 'match', ruleIds: ['r1'] },
      { userId: 'alice', destinationId: 'alice-slack', kind: 'match', ruleIds: ['r1'] },
    ]);
  });

  it('sends one Notification per destination listing every matching rule of that user', () => {
    const rules = [
      rule({ id: 'r1' }),
      rule({ id: 'r2', minSeverity: 3 }),
      rule({ id: 'r3', minSeverity: 4 }),
    ];
    expect(decide({ rules })).toEqual([
      { userId: 'alice', destinationId: 'alice-email', kind: 'match', ruleIds: ['r1', 'r2'] },
    ]);
  });

  it('keeps different users apart even when they share a destination id', () => {
    const rules = [rule({ id: 'r1' }), rule({ id: 'r2', userId: 'bob' })];
    expect(decide({ rules }).map((d) => d.userId)).toEqual(['alice', 'bob']);
  });

  it('sends nothing when no rule matches', () => {
    expect(decide({ rules: [rule({ id: 'r1', minSeverity: 4 })] })).toEqual([]);
  });
});

describe('decideNotifications — Event Updates (ADR 0001)', () => {
  const aliceAt = (highestSeverity: Severity): NotifiedRecipient => ({
    userId: 'alice',
    destinationId: 'alice-email',
    highestSeverity,
  });
  const alice = { userId: 'alice', destinationId: 'alice-email' };
  const rules = [rule({ id: 'r1' })];

  it('escalates when the Severity bucket goes up (M5.8 → M6.1)', () => {
    expect(decide({ event: event(4), rules, alreadyNotified: [aliceAt(3)] })).toEqual([
      { ...alice, kind: 'escalation', ruleIds: ['r1'] },
    ]);
  });

  it('stays silent within the same bucket (M5.8 → M5.9)', () => {
    expect(decide({ event: event(3), rules, alreadyNotified: [aliceAt(3)] })).toEqual([]);
  });

  it('stays silent on a downgrade', () => {
    expect(decide({ event: event(3), rules, alreadyNotified: [aliceAt(4)] })).toEqual([]);
  });

  it('stays silent on a text-only edit', () => {
    const edited = event(3, 'M 5.8 - 10 km S of Tokyo');
    expect(decide({ event: edited, rules, alreadyNotified: [aliceAt(3)] })).toEqual([]);
  });

  it('does not escalate again when a revision dips and returns (6.0 → 5.9 → 6.0)', () => {
    // Alice was escalated to 4 already; the dip to 3 was silent; back to 4 is nothing new.
    expect(decide({ event: event(4), rules, alreadyNotified: [aliceAt(4)] })).toEqual([]);
  });

  it('sends a first match to a rule whose threshold the upgrade crosses', () => {
    const bob = rule({ id: 'b1', userId: 'bob', minSeverity: 4, destinationIds: ['bob-slack'] });
    expect(
      decide({ event: event(4), rules: [...rules, bob], alreadyNotified: [aliceAt(3)] }),
    ).toEqual([
      { ...alice, kind: 'escalation', ruleIds: ['r1'] },
      { userId: 'bob', destinationId: 'bob-slack', kind: 'match', ruleIds: ['b1'] },
    ]);
  });

  it('sends a first match after a text edit makes a Keyword match', () => {
    const tokyo = rule({
      id: 't1',
      userId: 'bob',
      keywords: ['tokyo'],
      destinationIds: ['bob-slack'],
    });
    expect(decide({ event: event(3, 'M 5.8 - near Tokyo'), rules: [tokyo] })).toEqual([
      { userId: 'bob', destinationId: 'bob-slack', kind: 'match', ruleIds: ['t1'] },
    ]);
  });

  it('does not escalate to a recipient whose rules no longer match', () => {
    const narrowed = [rule({ id: 'r1', keywords: ['osaka'] })];
    expect(decide({ event: event(4), rules: narrowed, alreadyNotified: [aliceAt(3)] })).toEqual([]);
  });
});

describe('decideNotifications — properties', () => {
  const rulesArb = fc.array(
    fc.record({
      id: fc.uuid(),
      userId: fc.constantFrom('alice', 'bob'),
      category: fc.constant('earthquake' as const),
      minSeverity: severityArb,
      keywords: fc.constant<string[]>([]),
      destinationIds: fc.uniqueArray(fc.constantFrom('d1', 'd2', 'd3'), { minLength: 1 }),
    }),
    { maxLength: 6 },
  );
  const notifiedArb = fc.uniqueArray(
    fc.record({
      userId: fc.constantFrom('alice', 'bob'),
      destinationId: fc.constantFrom('d1', 'd2', 'd3'),
      highestSeverity: severityArb,
    }),
    { selector: (r) => `${r.userId}/${r.destinationId}` },
  );
  const inputArb = fc.record({ severity: severityArb, rules: rulesArb, notified: notifiedArb });
  type Input = typeof inputArb extends fc.Arbitrary<infer T> ? T : never;
  const run = ({ severity, rules, notified }: Input) =>
    decide({ event: event(severity), rules, alreadyNotified: notified });

  it('never escalates without going above the highest Severity already notified', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const d of run(input).filter((x) => x.kind === 'escalation')) {
          const seen = input.notified.find(
            (n) => n.userId === d.userId && n.destinationId === d.destinationId,
          );
          expect(seen).toBeDefined();
          expect(input.severity).toBeGreaterThan(seen?.highestSeverity ?? 5);
        }
      }),
    );
  });

  it('never sends a match to a recipient already notified', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const d of run(input).filter((x) => x.kind === 'match')) {
          expect(
            input.notified.some(
              (n) => n.userId === d.userId && n.destinationId === d.destinationId,
            ),
          ).toBe(false);
        }
      }),
    );
  });

  it('decides at most one Notification per recipient', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const keys = run(input).map((d) => `${d.userId}/${d.destinationId}`);
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });
});
