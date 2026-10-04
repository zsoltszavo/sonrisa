# Decision Log — Summary

One line per decision. The D-numbers match the full log, [decision-log.md](decision-log.md), which has the details and the rejected alternatives.

## Planning (D1–D16)

| # | Decision | Why |
|---|----------|-----|
| D1 | React frontend, NestJS backend. | Fits the role and the candidate's strengths. |
| D2 | Events come from USGS, one real disaster feed and a Simulated Source, behind one adapter interface. | Real integration plus repeatable demos. |
| D3 | "Important" is an Alert Rule: Category + minimum Severity (1–5) + optional Keywords + Channels. | Testable as a pure `matches(rule, event)`. |
| D4 | Keywords: case- and accent-insensitive, whole word/phrase, OR only. | Predictable; each rule is a unit test. |
| D5 | Scheduled polling per Event Source, intervals set by admins. | The feeds don't push. |
| D6 | Dedup Events on (source, externalId); no backfill; async delivery with retries. | No repeat alerts or floods. |
| D7 | Human course-correction: Event Updates are re-evaluated; a Severity rise sends an Escalation (ADR 0001). | Policies have thresholds; an upgrade can matter. |
| D8 | Single company; personal Alert Rules; users own Channel Destinations. | Covers team channels without a team model. |
| D9 | Email + password + JWT; user/admin roles; seeded demo accounts. | Enough for reviewers to log in. |
| D10 | Admin v1: Event Sources, Simulated Source console, Event explorer, Notification log. | Minimum to run and demo the pipeline. |
| D11 | `ChannelProvider` registry with zod config schemas that generate the forms; Email, Slack, then Webhook. | Proves "add channels later". |
| D12 | Slack verified against a local Slack Stand-in plus a contract test. | The real workspace isn't available. |
| D13 | pnpm monorepo; Vite + React, NestJS, Postgres + Prisma, pg-boss. | Shared schemas and logic; few moving parts. |
| D14 | Live rule preview in the browser using the shared matcher. | Strong UX without breaking no-backfill. |
| D15 | One source per Category; Freshness Window (6 h default); GDACS mappings and content hashes. | Live feeds had duplicates and messy dates. |
| D16 | Every session: gates, reality checks, independent `/code-review`, retro, saved prompts. | Makes the AI's direction and checking visible. |

## Implementation (D17–D24, one per session)

| # | Decision | Why |
|---|----------|-----|
| D17 | S1: Vitest everywhere, typed ESLint, ESM Nest, TS ~6.0 and Prisma 7.10 pinned. | What the current tools actually support. |
| D18 | S2: round magnitude before bucketing; apostrophes matched both ways; recipient = (User, Channel Destination); Escalate only above the highest Severity already notified. | Matches what users see; no repeat Escalations. |
| D19 | S3: Notification dedup on Severity; destination delete refused while in use; foreign ids answer 404; role re-read per request. | No dropped Escalations or cross-user leaks. |
| D20 | S4: handlers run in the Event's transaction; own scheduler loop; every Severity gets a revision; hash covers all shown fields. | Atomic Notifications; admin changes apply live. |
| D21 | S5: one job per attempt, app-scheduled retries, at-least-once delivery; exact Slack host allowlist. | Honours Retry-After; blocks SSRF. |
| D22 | S6: look copied from sonrisa.hu; token in localStorage; shared hints and error schema; forms refuse unknown schemas. | Human's ask; keeps D11's promise. |
| D23 | S7: admin read endpoints; filters in the URL; Simulator polls for live Escalations. | Shareable views; the demo shows Escalation live. |
| D24 | S8: Webhook channel with DNS-checked SSRF rules and an `Idempotency-Key`. | User-chosen URLs need a resolve-time check. |

## Final review (D25)

| # | Decision | Why |
|---|----------|-----|
| D25 | A raised Severity skips the Freshness Window; edits and downgrades of old Events stay silent. | GDACS upgrades days later reached nobody (CR92). |
