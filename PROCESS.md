# How sonrisa was built: the process

The brief was a single paragraph: *"alerts for when something important happens in the world, email and Slack, more channels later, an admin view."* This page links every artifact that shows how that paragraph became a working app, built with AI agents (Claude Code), with each step checked by a human. The code is the evidence. These documents are the process.

**Start here (10 minutes):**
1. Watch [`walkthrough.mp4`](walkthrough.mp4) (1:45): the app as a user (alice), then as an admin, then back to alice.
2. Read [`docs/plan.md`](docs/plan.md): the plan of attack, why it is in that order, and the definition of done every session had to meet.
3. Skim [`docs/decision-log-summary.md`](docs/decision-log-summary.md) and [`docs/ai-review-log-summary.md`](docs/ai-review-log-summary.md): what was decided, and what the AI got wrong and how it was caught.

---

## 1. From a vague brief to a precise domain (S0)

| Artifact | What it shows |
|---|---|
| [`docs/task-brief.txt`](docs/task-brief.txt) | The original task, as received. |
| [`docs/prompts/001`–`014`](docs/prompts/) | The planning "grilling": the AI asked one open question at a time (Q1–Q9: event sources, what "important" means, keyword rules, the pipeline, event updates, ownership, admin scope, channels, Slack with no workspace, stack, feed clean-up, process). I answered, pushed back or redirected each one. |
| [`CONTEXT.md`](CONTEXT.md) | The glossary (Event, Alert Rule, Severity, Escalation, Freshness Window, Channel, Destination …). Code, UI and docs use these words consistently. |
| [`docs/decision-log.md`](docs/decision-log.md) (D1–D16) | Every scoping decision, with the reason and the alternatives turned down. |
| [`docs/adr/`](docs/adr/) | ADR 0001 (an updated Event is evaluated again; only a rise in Severity notifies) and ADR 0002 (a Postgres-backed job queue, so a Notification and its job commit together). |
| [`docs/evidence/feed-samples/`](docs/evidence/feed-samples/) | Real USGS and GDACS responses saved on day one. The AI's assumptions about the feeds were checked against them (R3: GDACS also carries earthquakes, floods a 179-item first poll, and has unreliable dates → D15). |
| [`docs/sessions/S00-planning.md`](docs/sessions/S00-planning.md) | Retro: where the AI was wrong during planning. |

## 2. Execution: nine sessions, one milestone each (S1–S9)

Each session started from a clean context. It read the glossary, its own section of the plan, the decision log and the ADRs, and finished only when the definition of done in `plan.md` was met: gates green, a reality check, an independent code review with every finding accepted or rejected **with a reason**, the AI-shortcut checklist, a retro, the prompt saved, and a milestone commit with CI green.

| Session | Milestone | Retro | Commit(s) |
|---|---|---|---|
| S1 | Monorepo, infra, CI gates | [S01](docs/sessions/S01-scaffold.md) | `0c00658` |
| S2 | Pure domain core (matching, Severity mapping, Escalation), property-tested | [S02](docs/sessions/S02-domain-core.md) | `1747ff9`, `896f6ad` |
| S3 | Persistence, auth, owner-scoped API | [S03](docs/sessions/S03-persistence-auth-api.md) | `320af5f` |
| S4 | Ingestion: USGS, GDACS, Simulated | [S04](docs/sessions/S04-ingestion.md) | `129c2ea` |
| S5 | Matching and delivery: email, Slack, retries | [S05](docs/sessions/S05-matching-delivery.md) | `69f4a38` |
| S6 | User UI: destinations, rule editor with live preview | [S06](docs/sessions/S06-frontend-user.md) | `c29dbc3` |
| S7 | Admin UI: sources, simulator, events, notification log | [S07](docs/sessions/S07-admin-view.md) | `83dd33c` |
| S8 | Extensibility proof: a Webhook channel added without touching the pipeline | [S08](docs/sessions/S08-webhook-channel.md) | `9b55c21`, `f590fe0`, `2e07d05` |
| S9 | Playwright e2e, final full-repo review, README | [S09](docs/sessions/S09-submission.md) | `84e0ae3`, `3a566b4`, `90e6262` |

## 3. How AI output was checked

| Artifact | What it shows |
|---|---|
| [`docs/ai-review-log-summary.md`](docs/ai-review-log-summary.md) | The short version: 99 review findings (73 accepted, 9 partly accepted, 17 rejected with reasons), 65 reality checks, the most important catches and the patterns in what the AI got wrong. |
| [`docs/ai-review-log.md`](docs/ai-review-log.md) | The full log: every finding (CR1–CR99) and reality check (R1–R65), with its verdict and reason. |
| [`docs/decision-log-summary.md`](docs/decision-log-summary.md) / [`docs/decision-log.md`](docs/decision-log.md) | D1–D25. Several implementation decisions (D17+) are course corrections that a review or reality check forced. |
| Retros, "What the AI got wrong" sections | Per session: hallucinated or outdated APIs, tests that didn't really test (caught by mutation checks), shortcuts that were rejected. |
| [`docs/plan.md`](docs/plan.md) → AI-shortcut checklist | Walked through explicitly in every session: server-side auth, no `any`/casts/`ts-ignore`, no swallowed errors, tests that fail when the feature breaks, external APIs checked against reality, no invented library APIs. |

Typical checks: running against live feeds and saved samples, `npm view`/docs before trusting a version or flag, mutating code to make sure a test fails, stopping Postgres or the Stand-in to watch the failure paths, screenshots of every UI state, and a second independent reviewer when the review tool covered too little (S9).

## 4. Prompt history

[`docs/prompts/`](docs/prompts/) holds **every prompt, verbatim, with its outcome** (001–025). Most session kickoff prompts came from the previous session's handoff line, so each session's context was written down instead of carried over implicitly. An audit of every Claude Code transcript for this project (done during the wrap-up, prompt 025) found all saved prompts and no gaps. The only messages not saved are two one-line commit approvals that asked not to be saved.

## 5. Evidence: screenshots and intermediate output

| Folder | Contents |
|---|---|
| [`docs/evidence/s01/`](docs/evidence/s01/) | Health page with the database up and down. |
| [`docs/evidence/s05/`](docs/evidence/s05/) | Mailpit inbox, an Escalation email, the Slack Stand-in channel. |
| [`docs/evidence/s06/`](docs/evidence/s06/) | User UI: login, notifications, rule editor with live preview, keyword chips, schema-generated destination form, server errors, mobile. |
| [`docs/evidence/s07/`](docs/evidence/s07/) | Admin UI: sources, poll now, simulator and live Escalation, event history, notification log before and after a retry, non-admin redirected. |
| [`docs/evidence/s08/`](docs/evidence/s08/) | The Webhook form generated from its schema, the SSRF refusal, received payloads. |
| [`docs/evidence/s09/`](docs/evidence/s09/) | Screenshots taken by the Playwright e2e test of the core loop. |
| [`walkthrough.mp4`](walkthrough.mp4) | The narrated tour, recorded by [`e2e/walkthrough/walkthrough.spec.ts`](e2e/walkthrough/walkthrough.spec.ts) so it can be re-recorded. |

## 6. Deliverables

- **The app**: [`README.md`](README.md) covers what was built, one-command run (`pnpm demo`) and a 5-minute demo script.
- **Tests**: unit and property tests (shared domain), API e2e against Postgres and Mailpit, and a Playwright browser test of the core loop, all in CI.
- **Deliberately out of scope**: [`docs/next-steps.md`](docs/next-steps.md). Each cut links to the decision that made it.
