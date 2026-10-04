# Plan of Attack

## Why this order

1. **Make the domain precise before writing code** (S0). The brief is vague on purpose, and the cheapest place to fix ambiguity is the glossary and decision log, not a refactor.
2. **Pure logic before I/O** (S2). `matches()`, severity mapping and escalation decide whether the product is *correct*. They're pure functions, so we can test them exhaustively before any database, feed or UI hides bugs.
3. **Backend pipeline before UI** (S3–S5). Each stage can be checked on its own (seeded data → ingested Events → Notifications → messages showing up in Mailpit / Slack Stand-in). The UI is then built on endpoints we know work.
4. **Frontend last, but with the most polish** (S6–S7). It's a frontend role. The UI is where craft shows, and it relies on everything underneath.
5. **Prove extensibility after the fact** (S8). Adding a channel in its own commit, *after* the design is "done", is the honest test of the brief's "add more channels later".
6. **End-to-end + docs at the end** (S9), so the README describes what actually exists.

If we run out of time, cut from the end: S9's Playwright → S8 → admin polish. The core loop (rule → event → notification) has to work.

## Rules for every session

Each session starts fresh (`/clear`) and reads: `CONTEXT.md`, `docs/plan.md` (its own section), `docs/decision-log.md`, and the ADRs.

**Definition of done:**
1. Gates pass: `pnpm typecheck && pnpm lint && pnpm test`, with the output pasted into the retro.
2. A reality check where it applies (run it, screenshot to `docs/evidence/`).
3. An independent `/code-review` of the session diff. Each finding is accepted or rejected **with a reason** in `docs/ai-review-log.md`.
4. The AI-shortcut checklist (below) is walked through explicitly.
5. Retro written to `docs/sessions/SNN-<slug>.md`: goal, what the AI got wrong, what was changed, gate output.
6. Every prompt saved to `docs/prompts/` (verbatim + outcome).
7. A human-approved milestone commit (message explains *why*), then push.

**AI-shortcut checklist:**
- [ ] Role/auth checks happen on the server, not only hidden in the UI
- [ ] No `any`, no unexplained `as` casts, no `// @ts-ignore`
- [ ] No swallowed errors (`catch {}` / `catch (e) { console.log }`)
- [ ] Tests check behaviour, not mocks; at least one test would fail if the feature were broken
- [ ] External API fields / URLs checked against reality (fixtures, docs, curl)
- [ ] No invented library APIs (check versions and signatures)
- [ ] Glossary terms used consistently in code and UI (CONTEXT.md)

---

## S0 — Planning ✅ (done)

Brief analysed, grilled (Q1–Q9), glossary, D1–D16, ADR 0001–0002, live feeds checked, first commit `d3d9aac`.

## S1 — Scaffold & infrastructure ✅ (done)

Done in `0c00658` · [retro](sessions/S01-scaffold.md); gates and CI green.

**Goal:** an empty but fully wired monorepo where every gate runs.
- pnpm workspace: `apps/web` (Vite + React + TS + Tailwind + shadcn/ui + React Router + TanStack Query), `apps/api` (NestJS), `packages/shared` (TS lib, zod).
- Shared tsconfig/ESLint/Prettier; root scripts `dev`, `typecheck`, `lint`, `test`.
- `docker-compose.yml`: Postgres, Mailpit. Add a placeholder for the Slack Stand-in service (built in S5).
- Prisma set up in `apps/api` (no domain models yet), connected to Postgres.
- GitHub Actions CI running typecheck + lint + test.
- `.env.example`; README "Run locally" section.

**Done when:** `docker compose up -d && pnpm dev` serves the web app and an API `/health` that queries Postgres; CI is green.
**Watch for:** made-up or outdated versions/flags of scaffolding CLIs; Tailwind v3 vs v4 config mix-ups; shadcn init that doesn't match the Vite setup.
**Commit:** `Scaffold monorepo, infra and CI gates`

## S2 — Domain core (`packages/shared`) ✅ (done)

Done in `1747ff9`, `896f6ad` · [retro](sessions/S02-domain-core.md); gates and CI green.

**Goal:** the correctness-critical pure logic, test-first.
- zod schemas + types: `Event`, `Category`, `Severity` (1–5), `AlertRule`, `ChannelDestination` config base.
- Severity mapping: USGS magnitude (<4→1, 4–4.9→2, 5–5.9→3, 6–6.9→4, ≥7→5); GDACS (Green→2, Orange→4, Red→5).
- Keyword normalisation + `matches(rule, event)`: title + summary + location; case-insensitive; accents normalised; whole word/phrase; OR; empty = no filter (D4).
- `decideNotifications(previous, next, rules, alreadyNotified)` → new Matches + Escalations, following ADR 0001 (bucket goes up only; downgrades silent).
- `isFresh(event, window, now)` (D15).

**Done when:** example tests for every D4/ADR 0001 edge case + **fast-check property tests** (e.g. "normalising is idempotent", "a higher threshold never matches more events", "a downgrade never escalates").
**Watch for:** `\b` word boundaries failing on accented/non-ASCII text; off-by-one at 6.0; floating-point magnitude edges (5.95); an empty keyword list returning `false`.
**Commit:** `Domain core: matching, severity mapping, escalation rules`

## S3 — Persistence, auth, user-facing API ✅ (done)

Done in `320af5f` · [retro](sessions/S03-persistence-auth-api.md); gates and CI green.

**Goal:** a data model and secured CRUD.
- Prisma models: `User` (role), `ChannelDestination` (type + JSON config), `AlertRule` (category, minSeverity, keywords[], destinations m:n), `EventSource` (enabled, intervalSec, freshnessHours, lastPollAt, lastError), `Event` (source, externalId unique, category, severity, title, summary, location, url, occurredAt, contentHash), `EventRevision` (severity history), `Notification` (user, event, destination, kind match|escalation, ruleIds, status, attempts, lastError; unique user+event+destination channel).
- Seed: `admin@demo`, `alice@demo` with destinations (Mailpit email, `sonrisa · #world-alerts` Slack Stand-in) and sample rules.
- Auth: register/login, hashed passwords (argon2), JWT, `RolesGuard`.
- REST: `/me`, CRUD `/destinations`, `/rules` (scoped to the owner); request validation with the shared zod schemas.

**Done when:** e2e API tests prove that user A can't read or modify user B's rules and that a non-admin gets 403 on `/admin/*`.
**Watch for:** ownership checks missing on update/delete (IDOR); DTO validation that never runs; the password hash leaking in responses.
**Commit:** `Persistence, auth and rule/destination API`

## S4 — Ingestion ✅ (done)

Done in `129c2ea` · [retro](sessions/S04-ingestion.md); gates and CI green.

**Goal:** Events flow in from all three sources.
- `EventSourceAdapter` interface; adapters: **USGS** (GeoJSON), **GDACS** (RSS, drops EQ, `occurredAt = dateadded`, content hash), **Simulated** (create/update through the admin API).
- Scheduler: per-source interval read from the DB, re-read when an admin changes it (D5); `lastPollAt`/`lastError` recorded.
- Upsert on (source, externalId); new vs updated detection; `EventRevision` on severity change; emits a domain event `EventIngested{event, previous?}`.
- Admin API: list/update sources, "poll now", create/update simulated Event.

**Done when:** adapter tests run against the **saved real samples** in `docs/evidence/feed-samples/`; re-running the same poll creates 0 new Events; a revised fixture creates a revision.
**Watch for:** the XML namespace (`gdacs:`) parsed wrongly; timezones; overlapping polls (one slow poll overlapping the next).
**Commit:** `Event ingestion: USGS, GDACS and simulated sources`

## S5 — Matching & delivery ✅ (done)

Done in `69f4a38` · [retro](sessions/S05-matching-delivery.md); gates and CI green.

**Goal:** Events become delivered messages.
- On `EventIngested`: freshness check → `decideNotifications` → insert Notifications (unique key dedups) → enqueue pg-boss jobs in the same transaction (ADR 0002).
- `ChannelProvider` interface + registry; **Email** (Nodemailer → Mailpit, HTML + text); **Slack** (Incoming Webhook, Block Kit).
- **Slack Stand-in** service in docker-compose: accepts webhook POSTs in Slack's format, stores them, renders a simple web view. Labelled `sonrisa`.
- Retries: 3 attempts with exponential backoff; respect 429 `Retry-After`; mark failed at the end; admin retry endpoint.
- `GET /channels` exposes each provider's config schema (JSON Schema from zod) for the forms in S6; "send test" endpoint.

**Done when:** simulated event → email visible in Mailpit **and** message visible in the Slack Stand-in (screenshots); simulated upgrade → Escalation in both; a contract test pins the Slack payload to the documented webhook format.
**Watch for:** made-up Block Kit fields; Notification and job not written in the same transaction; retries that send twice after a crash; "sent" set before the send really succeeds.
**Commit:** `Matching and delivery: email, Slack, retries`

## S6 — Frontend: user experience ✅ (done)

Done in `c29dbc3` · [retro](sessions/S06-frontend-user.md); gates and CI green.

**Goal:** a polished UI for owning alerts. Visual direction decided at the start of the session (`frontend-design` skill).
- Login; app shell; route guards (UX only, the server enforces).
- **Destinations:** list, add/edit with a **form generated from the channel's config schema**, "send test".
- **Rule editor:** category, severity slider with labels (e.g. "≥4 ≈ M6+ / GDACS Orange"), keyword input with **per-category suggestion chips**, destination picker, and a **live preview** using the shared `matches()` against recent Events (D14).
- **My notifications:** feed of received alerts, Escalations marked.
- Loading, empty and error states; keyboard and screen-reader basics.

**Done when:** component tests for the rule editor + schema form; manual run with screenshots.
**Watch for:** the preview using different logic from the server (it must import the shared function); TanStack Query cache not refreshed after a mutation; generic template look.
**Commit:** `Frontend: destinations, rule editor with live preview`

## S7 — Frontend: admin view ✅ (done)

Done in `83dd33c` · [retro](sessions/S07-admin-view.md); gates and CI green.

**Goal:** the four admin capabilities (D10).
- **Event Sources:** enable/disable, interval, freshness window, last poll status/error, "poll now".
- **Simulated Source console:** create an Event; change an existing one's severity → Escalation can be shown live.
- **Event explorer:** filter by source/category/severity/time; detail with severity history and the Notifications it caused.
- **Notification log:** status/attempts/last error, filter failed, retry.

**Done when:** an admin can run the full demo script from the UI alone; non-admin users never see admin routes (and the server returns 403 anyway).
**Commit:** `Admin view: sources, simulator, events, notification log`

## S8 — Extensibility proof: Webhook channel ✅ (done)

Done in `9b55c21`, `f590fe0`, `2e07d05` · [retro](sessions/S08-webhook-channel.md); gates and CI green.

**Goal:** prove D11 for real.
- Add a `WebhookChannelProvider` (POST JSON to any URL), **in its own commit, without touching the pipeline or the frontend**.
- Write down what the diff touched (`git show --stat`). If it needed more than the provider + registration, log the leak and fix the abstraction.

**Done when:** the user can add a Webhook destination through the generated form and receive events; the diff stat is in the retro.
**Commit:** `Add Webhook channel (extensibility proof)`

## S9 — End-to-end, hardening, submission ✅ (done)

Done in `84e0ae3`, `3a566b4`, `90e6262` · [retro](sessions/S09-submission.md); gates and CI green.

**Goal:** a submission that can be reviewed.
- Playwright: login as alice → create rule → admin simulates event → notification appears (Mailpit/Stand-in API checked).
- Final full `/code-review` + shortcut checklist over the whole repo.
- README: what was built, how to run (one command), a demo script, how to read the process, known limitations (links to next-steps).
- Screenshots / short GIF in `docs/evidence/`.
- Look over the prompt history and decision log for gaps.

**Commit:** `E2E tests, docs and submission polish`
