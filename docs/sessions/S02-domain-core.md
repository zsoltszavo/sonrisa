# S2 — Domain core (retro)

**Goal:** the correctness-critical pure logic in `packages/shared`, test-first: schemas, Severity mapping, Keyword matching (D4), the escalation decision (ADR 0001), freshness (D15).

## What was built

- **`event.ts`:** zod schemas + types for `Category`, `Severity` (literal `1|2|3|4|5`), `EventSourceKey`, `Event` (http(s)-only `url`, `occurredAt` from a `Date` or an ISO string with an offset), `AlertRule` / `AlertRuleInput` (validated, de-duplicated Keywords), and `ChannelDestinationBase` (Channel key is a string so new providers need no shared edit, D11).
- **`severity.ts`:** `severityFromUsgsMagnitude` (integer edges on the one-decimal magnitude USGS shows; `null` → 1) and `severityFromGdacsAlertLevel` (Green→2, Orange→4, Red→5).
- **`text.ts`:** `normaliseText` (apostrophes → NFKD → strip marks → lower-case → fold ı/ł/ø/ß/… → collapse non-word runs), `normalisedVariants` (apostrophe joined *and* split) and `containsPhrase` (space-padded whole word/phrase, no ASCII-only `\b`).
- **`matching.ts`:** `eventMatcher(event)` normalises an Event once; `matches(rule, event)` = Category + Severity ≥ minimum + Keywords (OR, per field, empty = no filter). The web preview (D14) and the API will both import it.
- **`notifications.ts`:** `decideNotifications({ event, rules, alreadyNotified })` → `match` / `escalation` per (User, Channel Destination), listing every matching rule.
- **`freshness.ts`:** `isFresh(event, hours, now)`, inclusive edge, default 6 h.

Tests: 108 in 7 files. They include example tests for every D4 and ADR 0001 edge case, checks against the saved USGS and GDACS samples, and fast-check properties: normalising is idempotent and case-blind, a higher threshold never matches more, adding a Keyword never matches less, Severity is monotonic in magnitude, there's at most one Notification per recipient, a match never goes to someone already notified, and nothing escalates unless the Severity goes above what was already notified.

## Deviation from the plan

The plan sketched `decideNotifications(previous, next, rules, alreadyNotified)`. After review finding CR14 it takes each already-notified recipient's **highest notified Severity** instead of `previous`. Comparing with the previous version would escalate twice on a revision that dips and comes back (M5.9→6.0→5.9→6.0). D18 records the decisions made in this session.

## What the AI got wrong

- **Normalisation order** (R18): lower-casing before NFKD wasn't idempotent; fast-check found `"𝜜"` within 7 runs.
- **Its own apostrophe rule** (R19): joining across apostrophes fixed the `Pāpa‘ikou` case from the USGS sample but broke `Côte d’Ivoire`. Both readings are now matched.
- **Literal float edges** (R20): a raw 5.96 would sit below the M6 edge while USGS titles it "M 6.0"; the sample check pinned it.
- **Mutation script** (R21): the restore used `git checkout` on untracked files and failed silently, leaving four mutations in the source. Caught by `git status`, reverted, and tests re-run.
- **Invented type usage** (R22): `fc.RecordValue` takes two type arguments.
- Missed by the AI, caught by review: `javascript:` URLs passing `z.url()`, `null` dates coercing to 1970, NFKD not folding `ı`/`ł`/`ß`, `´` handled after NFKD, test util in `dist`, flip-flop re-escalation.

## Independent review

`/code-review` (high) gave 10 findings (CR11–CR20): 7 accepted and fixed with a regression test each, 3 rejected with reasons. Destination ownership belongs to S3 authorisation. `Event` is the glossary name. A future-date cap would be a guess with no evidence, and adapters own date sanity.

## Reality checks

- Ran against the saved feed samples: every USGS feature's Severity equals the Severity of the magnitude shown in its title; every GDACS alert level in the sample (174 Green, 4 Orange, 1 Red) parses and maps; USGS place `Pāpa‘ikou` matches `Papaikou`.
- Mutation checks (each must fail tests): `>=`→`>` on minimum Severity (3 fail), escalate on any change (5), no magnitude rounding (8), empty Keywords → false (11), allow empty phrase (13).
- `pnpm build` output contains no test files.

## AI-shortcut checklist

- [x] Role/auth checks on the server: n/a (pure functions). Destination ownership has been handed to S3 explicitly (CR15).
- [x] No `any`, no `@ts-ignore`. The only `as` is `JSON.parse(...) as {...}` on the saved fixture in a test, whose shape the test then checks.
- [x] No swallowed errors: no try/catch in the domain core; unknown GDACS levels are rejected by the schema, not guessed.
- [x] Tests check behaviour, not mocks: no mocks at all; the mutation checks above.
- [x] External fields checked against reality: USGS `mag`/`title`/`place` and GDACS `alertlevel` read from the saved samples in tests.
- [x] No invented library APIs: `z.literal([...])`, `z.url({ protocol })`, `z.iso.datetime({ offset })` checked in node against zod 4.6.5; fast-check 4.10.2 (`npm view`); the wrong `fc.RecordValue` usage was caught by typecheck (R22).
- [x] Glossary terms: `Event`, `Category`, `Severity`, `AlertRule`, `Keyword`, `ChannelDestination`, `Escalation` (`kind: 'escalation'`), `isFresh` / Freshness Window.

## Gate output (final run)

```
$ pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
packages/shared typecheck: Done · apps/api typecheck: Done · apps/web typecheck: Done
$ eslint . --max-warnings=0        (no problems)
All matched files use Prettier code style!
packages/shared test:  Test Files  7 passed (7)   Tests  108 passed (108)
apps/api test:         Test Files  1 passed (1)   Tests  2 passed (2)
apps/web test:         Test Files  1 passed (1)   Tests  4 passed (4)
build: shared Done · api Done · web ✓ built
gates exit=0
```

(e2e not re-run: nothing in `apps/api` changed.)

## Notes for later sessions

- **S3:** `Notification` must store the Severity it reported (escalation compares with the highest one per recipient, D18(d)). Uniqueness is per (user, event, destination, kind) rather than per Channel type (D18(c)). Rule create/update must check that every `destinationId` belongs to the user (CR15).
- **S4:** adapters build Events with `severityFromUsgsMagnitude` / `severityFromGdacsAlertLevel` and validate with `eventSchema` (URLs must be http(s); dates need an offset, so add `Z` if a feed omits it).
- **S5:** call `isFresh` first, then `decideNotifications` with `alreadyNotified` loaded from Notifications for that Event.
- **S6:** the rule preview imports `matches` / `eventMatcher` from `@sonrisa/shared`; alias `Event` if a file also needs the DOM type.
