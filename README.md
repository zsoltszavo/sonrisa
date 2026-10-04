# Sonrisa — World Event Alerts

Users set up **Alert Rules** and get notified (Email, Slack, Webhook) when an important world **Event** happens: earthquakes, disasters, news, market moves. Admins manage the Event Sources, simulate Events and watch every delivery.

> This repository is an interview task: *"take a vague brief from ambiguity to a working implementation using AI agents."* **The process is the main deliverable**; the code is the evidence. [How to read the process](#how-to-read-the-process) explains where to look, and [`PROCESS.md`](PROCESS.md) maps every process artifact. A 1:45 video tour of the app (user, then admin) is in [`walkthrough.mp4`](walkthrough.mp4).

![alice's notifications after the demo flow](docs/evidence/s09/04-alice-notifications.png)

## What was built

**For users**
- Sign in (seeded demo accounts, or self-registration as a `user`).
- **Destinations**: where alerts go. One generated form per Channel (Email, Slack, Webhook), each with "Send test".
- **Alert Rules**: a Category, a minimum Severity (1–5), optional Keywords (whole word or phrase, any of them), and one or more Destinations. A live preview shows which recent Events the rule would have matched.
- **My notifications**: every alert sent, its status (Sending / Delivered / Not delivered), and Escalations when an Event gets more severe.

**For admins** (role checked on the server; a user gets `403`)
- **Event Sources**: USGS earthquakes and GDACS disasters (real feeds, polled on a per-source interval), plus the Simulated Source. Pause, resume or "poll now".
- **Simulator**: create an Event, or raise/lower its Severity. Raising it across a bucket sends Escalations ([ADR 0001](docs/adr/0001-event-updates-are-re-evaluated.md)).
- **Events** explorer and **Notification log** with each attempt's error and a retry button for failed ones.

**Under the hood**
- **Ingestion**: each Event Source maps its raw data to one Event shape and one Severity scale; revisions of an Event are stored and checked again ([ADR 0001](docs/adr/0001-event-updates-are-re-evaluated.md)). A Freshness Window (6 h by default) keeps a first poll from flooding users with old Events, and each Category has one authoritative source (D15).
- **Matching** is one pure function in `packages/shared` (used by the API and by the rule preview).
- **Delivery**: one Notification per user, Destination and Event, listing every rule that matched. A Postgres-backed job queue (pg-boss, [ADR 0002](docs/adr/0002-postgres-backed-job-queue.md)) sends it: up to 3 attempts with backoff, permanent errors fail at once, at-least-once delivery (D21).
- **Channels are plug-ins** (D11): a `ChannelProvider` declares its config schema, and the web app renders the destination form from that schema. The Webhook channel was added in S8 as the proof: the pipeline, shared package and web app were not touched ([S8 retro](docs/sessions/S08-webhook-channel.md#the-diff-stat-the-extensibility-proof)).
- **SSRF rules** for every user-supplied URL: Slack only to `hooks.slack.com` (or the dev Stand-in); Webhook only to public `https://` hosts, checked again by a DNS lookup before each send (D24).

| Workspace | What it is |
|---|---|
| `apps/web` | Vite + React + TypeScript, Tailwind v4 + shadcn/ui, React Router, TanStack Query |
| `apps/api` | NestJS 12 (ESM) + Prisma 7 (Postgres via `@prisma/adapter-pg`) + pg-boss |
| `packages/shared` | zod schemas, types and the matching rules, shared by web and API |
| `apps/slack-standin` | Slack Stand-in (D12): plain Node 24, no dependencies, runs in docker compose |
| `e2e` | Playwright browser test of the whole loop |

## Run it

Requires Node 24.15+ (`.nvmrc`), pnpm via Corepack (`corepack enable pnpm`) and Docker.

Once, after cloning:

```sh
cp .env.example .env          # one .env at the repo root serves every app
echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env
pnpm install                  # also generates the Prisma client
```

Then **one command** starts everything (Postgres, Mailpit, the Slack Stand-in, migrations, seed data, API and web):

```sh
pnpm demo
```

| What | Where |
|---|---|
| The app | http://localhost:5173 |
| API health | http://localhost:3000/api/health (`200 {"status":"ok","database":"up"}`, `503` without Postgres) |
| Mailpit (every email lands here; nothing leaves the machine) | http://localhost:8025 |
| Slack Stand-in | http://localhost:4010 |
| Webhook receiver (optional, see the demo) | http://localhost:4012/received |

| Demo account | Password | Role |
|---|---|---|
| `alice@demo.test` | `sonrisa-alice-demo` | user, with an email and a `sonrisa · #world-alerts` Slack destination and sample rules |
| `admin@demo.test` | `sonrisa-admin-demo` | admin |

`pnpm db:seed` is safe to re-run. The USGS and GDACS feeds are polled for real; set `INGESTION_SCHEDULER=off` in `.env` to keep the API offline (simulated Events still work).

> **The Slack Stand-in is not Slack.** The target workspace "sonrisa" wasn't available, so a small local service accepts Slack Incoming Webhook POSTs (`/hooks/<channel>`), checks them against Slack's documented format and shows the Block Kit it received (D12). A real `https://hooks.slack.com/services/…` URL works the same way. The two env lines that point the API at local receivers are already in `.env.example`:
>
> ```sh
> SLACK_STANDIN_URL=http://localhost:4010          # Slack destinations may post to the Stand-in
> WEBHOOK_ALLOWED_ORIGINS=http://localhost:4012    # Webhook destinations may post to the local receiver
> ```
>
> Without them the API allows only real Slack and public `https://` webhooks, and the seeded `#world-alerts` destination fails with "must be a Slack Incoming Webhook". Leave both empty in a real deployment.

## Demo script (about 5 minutes)

1. **Sign in as alice** at http://localhost:5173. *My notifications* may already show alerts from the real feeds.
2. **Destinations** → *Add destination*:
   - **Slack**, Webhook URL `http://localhost:4010/hooks/demo` → *Send test*. It shows up in the Stand-in's `#demo` channel.
   - **Webhook** (optional): start the receiver in a second terminal with `pnpm webhook-receiver`, then Endpoint URL `http://localhost:4012/demo` → *Send test*. The JSON body is at http://localhost:4012/received. Try `https://169.254.169.254/` to see the SSRF rule refuse it.
3. **Alert rules** → *New rule*: **Markets**, minimum Severity 3, Keyword `forint`, Destinations *My email* and the Slack one you just added. The preview on the right shows what it would have matched. *Create rule*.
4. **Sign out, sign in as admin** → *Simulator*: Category **Markets**, Severity **3 · Significant**, Title `Forint falls 4% against the euro`, Location `Budapest, Hungary` → *Create Event*.
5. **Watch it arrive**: the email in Mailpit, the Block Kit message in the Stand-in, and both in the admin *Notification log* as **Sent** (it refreshes every 10 s).
6. **Escalate it**: in the Simulator's *Change Severity*, raise the Event to **5 · Critical**. One "Escalated" follow-up goes to each destination. Lowering it sends nothing (ADR 0001).
7. **See a failure**: Slack destinations here post to the Stand-in. `docker compose stop slack-standin`, simulate another matching Event (e.g. `Forint slides again`), and watch the log: the Slack Notification retries (after 30 s, then 60 s) and is marked **Failed** with the error. `docker compose start slack-standin`, then *Retry* it.
8. **Sign back in as alice**: *My notifications* shows the Match and the Escalation.

The same loop runs automatically as a Playwright test; its screenshots are in [`docs/evidence/s09/`](docs/evidence/s09/).

## Tests and gates

```sh
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test   # unit tests need no database
pnpm test:e2e       # API against Postgres + Mailpit (starts its own Stand-in on 4011)
pnpm test:browser   # Playwright: builds and starts API (3100), web (5174) and a Stand-in (4014)
```

Both e2e suites need `docker compose up -d` and change the database they point at, so give them their own (e.g. `DATABASE_URL=postgresql://sonrisa:sonrisa@localhost:5433/sonrisa_e2e pnpm test:browser`) rather than the demo one. The browser test refuses to start without an explicit `DATABASE_URL`. CI (`.github/workflows/ci.yml`) runs all of them on every push. The browser test needs Chromium once: `pnpm --filter @sonrisa/e2e exec playwright install chromium`. `EVIDENCE_DIR=<dir>` makes it save screenshots.

## API

All under `/api`; every route needs `Authorization: Bearer <token>` unless marked public.

| Route | What it does |
|---|---|
| `POST /auth/register`, `POST /auth/login` (public) | Returns `{ accessToken, user }`. Self-registration always creates a `user` |
| `GET /me`, `GET /me/notifications` | The signed-in user; their own Notifications |
| `GET/POST /destinations`, `GET/PUT/DELETE /destinations/:id` | The user's own Channel Destinations (config validated per Channel) |
| `POST /destinations/:id/test` | Sends a test message now: `{ delivered: true }` or `{ delivered: false, error }` |
| `GET/POST /rules`, `GET/PUT/DELETE /rules/:id` | The user's own Alert Rules; every destination must be the user's own |
| `GET /events/recent` | Recent Events of a Category, for the rule preview |
| `GET /channels` | Each Channel with the JSON Schema of its destination config |
| `GET /admin/event-sources`, `PATCH /admin/event-sources/:key`, `POST /admin/event-sources/:key/poll` | Admin only (403 for users) |
| `GET /admin/events`, `GET /admin/events/:id`, `GET /admin/notifications` | Events explorer and Notification log |
| `POST /admin/simulated-events`, `PUT /admin/simulated-events/:id` | Create / revise a Simulated Event (a raised Severity sends Escalations) |
| `POST /admin/notifications/:id/retry` | Queues a `failed` Notification again (409 otherwise) |

Another user's rule or destination answers `404`, the same as one that doesn't exist.

## How to read the process

The work ran as one planning session and nine build sessions, each started fresh from the docs below, each ending with gates, a reality check, an independent AI code review and a retro.

| Read | What it shows |
|---|---|
| [`PROCESS.md`](PROCESS.md) | One-page map of the whole process, with links |
| [`walkthrough.mp4`](walkthrough.mp4) | Video tour: the app as a user, then as an admin |
| [`docs/task-brief.txt`](docs/task-brief.txt) | The original, deliberately vague brief |
| [`docs/sessions/S00-planning.md`](docs/sessions/S00-planning.md) | How the brief was grilled into decisions (Q1–Q9) before any code |
| [`CONTEXT.md`](CONTEXT.md) | The domain glossary; code and UI use these words |
| [`docs/decision-log.md`](docs/decision-log.md) | All 25 decisions, why, and what was rejected ([summary](docs/decision-log-summary.md)) |
| [`docs/adr/`](docs/adr/) | The two decisions that are hard to reverse |
| [`docs/plan.md`](docs/plan.md) | The session plan, the definition of done and the AI-shortcut checklist |
| [`docs/sessions/`](docs/sessions/) | One retro per session: goal, what the AI got wrong, what changed, gate output |
| [`docs/ai-review-log.md`](docs/ai-review-log.md) | Every place AI output was checked against reality (R-entries) or reviewed (CR-entries), with the verdict and reason ([summary](docs/ai-review-log-summary.md)) |
| [`docs/prompts/`](docs/prompts/) | Every prompt, verbatim, with its outcome |
| [`docs/evidence/`](docs/evidence/) | Feed samples and screenshots from each reality check |

A quick path: the brief → S00 → the decision log → one build retro (S05 delivery or S08 extensibility) → the review log.

## Known limitations

Deliberate scope cuts, each linked to the decision that cut it, are in [`docs/next-steps.md`](docs/next-steps.md). The ones a reviewer is most likely to notice:

- **Email goes to Mailpit only, Slack to the Stand-in** unless you give it a real webhook URL (D11, D12).
- **No password reset, email verification, OAuth or rate limiting** on login (D9, D19(g)).
- **News and markets come from the Simulated Source**; there is no free feed with a usable severity (D2, D15).
- **Delivery is at-least-once**: a crash between sending and recording it sends again. Webhooks carry an `Idempotency-Key` for this (D21, D24).
- **Lists show the newest entries only** (no pagination), and the screens refresh by polling (every 2–30 s) rather than by push.
- **Webhooks are not signed** (no HMAC secret yet) and can't target private networks (D24).
