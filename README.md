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
docker compose up -d --wait   # Postgres (host port 5433) + Mailpit
pnpm install                  # also generates the Prisma client
pnpm dev                      # web on http://localhost:5173, API on http://localhost:3000
```

- `http://localhost:5173` shows the API and database status (the web dev server proxies `/api` to the API).
- `http://localhost:3000/api/health` returns `200 {"status":"ok","database":"up"}`, or `503` when Postgres is unreachable.
- Mailpit UI: `http://localhost:8025`.

| Workspace | What it is |
|---|---|
| `apps/web` | Vite + React + TypeScript, Tailwind v4 + shadcn/ui, React Router, TanStack Query |
| `apps/api` | NestJS 12 (ESM) + Prisma 7 (Postgres via `@prisma/adapter-pg`) |
| `packages/shared` | zod schemas and types shared by web and API |

**Gates** (the same ones run in CI, `.github/workflows/ci.yml`):

```sh
pnpm typecheck && pnpm lint && pnpm test   # unit tests need no database
pnpm test:e2e                              # API against the real Postgres from docker compose
```
