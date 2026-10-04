# Sonrisa — World Event Alerts

Users set up **Alert Rules** and get notified (Email, Slack, more channels later) when an important world **Event** happens: earthquakes, disasters, news, market moves. Admins manage sources, simulate events and watch deliveries.

> This repository is an interview task: *"take a vague brief from ambiguity to a working implementation using AI agents."* **The process is the main deliverable**; the code is the evidence.

## How to read this repo

| Start here | What it shows |
|---|---|
| [`docs/task-brief.txt`](docs/task-brief.txt) | The original brief |
| [`CONTEXT.md`](CONTEXT.md) | The domain glossary we agreed on |
| [`docs/decision-log.md`](docs/decision-log.md) | Every decision, why, and what was rejected |
| [`docs/adr/`](docs/adr/) | The decisions that are hard to reverse |
| [`docs/ai-review-log.md`](docs/ai-review-log.md) | Where AI output was checked, corrected or rejected |
| [`docs/prompts/`](docs/prompts/) | Every prompt, verbatim, in order |
| [`docs/next-steps.md`](docs/next-steps.md) | Deliberate scope cuts |

## Run locally

Requires Node 24.15+ (`.nvmrc`), pnpm via Corepack (`corepack enable pnpm`) and Docker.

```sh
cp .env.example .env          # one .env at the repo root serves every app
echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env
docker compose up -d --wait   # Postgres (host port 5433), Mailpit, Slack Stand-in
pnpm install                  # also generates the Prisma client
pnpm db:migrate               # apply Prisma migrations
pnpm db:seed                  # demo users, destinations, rules and Event Sources (safe to re-run)
pnpm dev                      # web on http://localhost:5173, API on http://localhost:3000
```

Demo accounts (seeded):

| Email | Password | Role |
|---|---|---|
| `admin@demo.test` | `sonrisa-admin-demo` | admin |
| `alice@demo.test` | `sonrisa-alice-demo` | user (has an email + `sonrisa · #world-alerts` destination and sample rules) |

- `http://localhost:5173` shows the API and database status (the web dev server proxies `/api` to the API).
- `http://localhost:3000/api/health` returns `200 {"status":"ok","database":"up"}`, or `503` when Postgres is unreachable.
- Mailpit UI: `http://localhost:8025` (every email the Email channel sends lands here; nothing leaves the machine).
- Slack Stand-in: `http://localhost:4010`. **This is not a real Slack workspace.** The target workspace "sonrisa" isn't available yet, so a small local service (`apps/slack-standin`) accepts Slack Incoming Webhook POSTs (`/hooks/<channel>`), checks them against Slack's documented format, and shows the Block Kit it received (D12). A real `https://hooks.slack.com/services/…` URL works the same way.

**API** (all under `/api`; every route needs `Authorization: Bearer <token>` unless marked public):

| Route | What it does |
|---|---|
| `POST /auth/register`, `POST /auth/login` (public) | Returns `{ accessToken, user }`. Self-registration always creates a `user` |
| `GET /me` | The signed-in user |
| `GET/POST /destinations`, `GET/PUT/DELETE /destinations/:id` | The user's own Channel Destinations (config validated per Channel) |
| `GET/POST /rules`, `GET/PUT/DELETE /rules/:id` | The user's own Alert Rules; every destination must be the user's own |
| `GET /channels` | Each Channel (`email`, `slack`) with the JSON Schema of its destination config |
| `POST /destinations/:id/test` | Sends a test message now: `{ delivered: true }` or `{ delivered: false, error }` |
| `GET /admin/event-sources`, `PATCH /admin/event-sources/:key`, `POST /admin/event-sources/:key/poll` | Admin only (403 for users) |
| `POST /admin/simulated-events`, `PUT /admin/simulated-events/:id` | Create / revise a Simulated Event (a raised Severity sends Escalations) |
| `POST /admin/notifications/:id/retry` | Queues a `failed` Notification again (409 otherwise) |

Another user's rule or destination answers `404`, the same as one that doesn't exist.

| Workspace | What it is |
|---|---|
| `apps/web` | Vite + React + TypeScript, Tailwind v4 + shadcn/ui, React Router, TanStack Query |
| `apps/api` | NestJS 12 (ESM) + Prisma 7 (Postgres via `@prisma/adapter-pg`) |
| `packages/shared` | zod schemas and types shared by web and API |
| `apps/slack-standin` | Slack Stand-in (D12): plain Node 24, no dependencies, runs in docker compose |

**Gates** (the same ones run in CI, `.github/workflows/ci.yml`):

```sh
pnpm typecheck && pnpm lint && pnpm test   # unit tests need no database
pnpm test:e2e                              # API against Postgres + Mailpit from docker compose (starts its own Stand-in on 4011)
```
