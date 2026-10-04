# S1 — Scaffold & infrastructure (retro)

**Goal:** an empty but fully wired monorepo where every gate runs: `docker compose up -d && pnpm dev` serves the web app and an API `/health` that queries Postgres; CI runs typecheck + lint + test.

## What was built

- **pnpm 12 workspace:** `apps/web`, `apps/api`, `packages/shared`; root `dev`, `build`, `generate`, `typecheck`, `lint`, `format(:check)`, `test`, `test:e2e`.
- **`apps/web`:** Vite 8 + React 19 + TS 6, Tailwind v4 (`@tailwindcss/vite`, no `tailwind.config`), shadcn/ui (radix, preset nova; `card` + `badge`), React Router 8 (data router), TanStack Query 5. One page shows the API/DB status through a Vite `/api` proxy. Vitest + jsdom + Testing Library.
- **`apps/api`:** NestJS 12 (ESM), `@nestjs/config` with a zod-validated env, Prisma 7.10 (`prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`, no models yet), `GET /api/health` → `SELECT 1` → 200 / 503. Unit test + e2e test against real Postgres.
- **`packages/shared`:** zod `healthResponseSchema` used by both sides (API return type, web runtime parsing). It exports `src` for types and Vite dev, and `dist` for Node.
- **Infra:** `docker-compose.yml` (Postgres 18 on host port 5433, Mailpit; Slack Stand-in placeholder for S5), `.env.example` (one root `.env`), GitHub Actions CI (Postgres service; typecheck, lint, format, unit, e2e, build).
- **Lint:** one root ESLint flat config, `typescript-eslint` `strictTypeChecked` + react-hooks + react-refresh.

## What the AI got wrong (or would have, from memory)

Details are in `ai-review-log.md` R4–R17. The headline items:
- The **plan itself was out of date**: Nest 12 generates ESM + Vitest + oxlint, so D13's "Jest" no longer fits → D17.
- **Version traps** that "install latest" would have hit: Prisma `latest` = 8.0 RC; TypeScript 7 is outside typescript-eslint's range; `react-router-dom` has no v8.
- **Changed CLIs**: shadcn's `--base-color` flag is gone; Prisma `init` writes `prisma7.config.ts` and drops AI-agent skill files into `.claude/`; pnpm 12 fails install on unapproved build scripts.
- **AI's own mistakes**: a wrong ESLint rule name (`extraneous-class`); assuming `postinstall` always regenerates the Prisma client (a CI-style clean run proved it doesn't).
- **Generator's own bug**: Nest 12's e2e template import `supertest/types` doesn't typecheck.

## Independent review

`/code-review` (high) gave 10 findings: 7 accepted, 1 partly accepted, 2 rejected with evidence (CR1–CR10). The useful catches were the Vite proxy ignoring the root `.env` `API_PORT`, cwd-relative `.env` paths, and a test that claimed to cover non-JSON responses but sent valid JSON. The "API won't boot with DB down" claim was disproved by running it.

## Reality checks

- `curl localhost:3000/api/health` → `200 {"status":"ok","database":"up"}`; with `docker compose stop postgres` → `503 {"status":"error","database":"down"}`; it recovers after `start` with no restart.
- The same request through the Vite proxy (5173) works, including with `API_PORT=3001`.
- Screenshots: `docs/evidence/s01/web-health-up.png`, `docs/evidence/s01/web-health-db-down.png`.
- CI-style run: build output and the generated client deleted, `.env` removed, `DATABASE_URL` from the environment only → all gates green.
- Mutation check: removing the 503 `throw` fails the unit test.

## AI-shortcut checklist

- [x] Role/auth checks on the server: n/a in S1 (no auth yet; `/health` is public by design).
- [x] No `any`, no `@ts-ignore`. One `as unknown as PrismaService` in the controller unit test, explained in a comment (a stub exposing only `$queryRaw`); the real path is covered by e2e.
- [x] No swallowed errors: the health check logs the stack and rethrows as 503; the web distinguishes "DB down" from "API unreachable".
- [x] Tests check behaviour: the e2e test hits real Postgres; the mutation check above.
- [x] External APIs/URLs checked: every CLI flag and version came from `npm view`, `--help`, real scratch runs and the official docs (R4–R12).
- [x] No invented library APIs: Prisma 7 adapter constructor, `$queryRaw`, React Router v8 imports, jest-dom `./vitest` export and supertest types were all checked against installed packages.
- [x] Glossary terms: no domain terms in code yet.

## Gate output (final run)

```
$ pnpm generate && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e && pnpm build
✔ Generated Prisma Client (7.10.0)
packages/shared typecheck: Done · apps/api typecheck: Done · apps/web typecheck: Done
$ eslint . --max-warnings=0        (no problems)
All matched files use Prettier code style!
packages/shared test:  Test Files  1 passed (1)   Tests  3 passed (3)
apps/api test:         Test Files  1 passed (1)   Tests  2 passed (2)
apps/web test:         Test Files  1 passed (1)   Tests  4 passed (4)
apps/api test:e2e:     Test Files  1 passed (1)   Tests  1 passed (1)
build: shared Done · api Done · web ✓ built
gates exit=0
```

CI on GitHub runs on the first push (pending the human-approved commit).

## Notes for later sessions

- Local Node is 24.14.1; the Nest CLI wants ≥ 24.15 (warnings only). Upgrading is recommended.
- `pnpm generate` after changing `schema.prisma` (S3); the generated client lives in `apps/api/src/generated` (gitignored).
- `.serena/` (local tool config) is gitignored, as are `*.md` files for Prettier, so prose formatting stays as written.
