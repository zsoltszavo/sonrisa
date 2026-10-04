# S3 — Persistence, auth, user-facing API (retro)

**Goal:** a data model and secured CRUD. Prisma models, seed, argon2 + JWT auth with a `RolesGuard`, and `/me`, `/destinations`, `/rules` validated with the shared zod schemas. **Done when:** e2e tests prove user A can't read or modify user B's rules or destinations, and a non-admin gets 403 on `/admin/*`.

## What was built

- **Prisma models** (one migration `s3_domain_models`): `User` (role), `ChannelDestination` (Channel key string + JSON config), `AlertRule` (category, minSeverity, keywords[]), `AlertRuleDestination` (explicit join; destination side `RESTRICT`), `EventSource` (enabled, intervalSec, freshnessHours, lastPollAt, lastError), `Event` (unique `(sourceId, externalId)`, contentHash), `EventRevision`, `Notification` (kind, **severity**, ruleIds, status, attempts, lastError; unique `(userId, eventId, destinationId, severity)`; destination `SET NULL`).
- **Seed** (`pnpm db:seed`, idempotent): `admin@demo.test`, `alice@demo.test` with an email destination and `sonrisa · #world-alerts` (Slack Stand-in URL), four sample rules, and the three Event Sources.
- **Auth:** `POST /auth/register` / `login` → `{ accessToken, user }`; argon2id; HS256 JWT with only `sub`; global `AuthGuard` (opt-out with `@Public()`) that re-reads the User on each request; global `RolesGuard` (`@Roles(['admin'])` on the whole `/admin` controller).
- **API:** `GET /me`; `GET/POST /destinations`, `GET/PUT/DELETE /destinations/:id`; `GET/POST /rules`, `GET/PUT/DELETE /rules/:id`; `GET /admin/event-sources`. Every query is scoped by `userId` in the same statement; foreign ids are 404. Rule writes check every `destinationId` is the user's own (CR15) → 400. Bodies go through `ZodValidationPipe` with the shared schemas; Channel config through a per-Channel strict zod registry.
- **Shared:** `user.ts` (`registerInputSchema`, `loginInputSchema`, `userSchema`, `authResponseSchema`, `emailSchema`), `channelDestinationInputSchema`, unique `destinationIds`.
- **CI:** `pnpm db:migrate` before e2e; a throwaway `JWT_SECRET`.

## Deviations from the plan / handoff

- **Notification uniqueness** is (user, event, destination, **Severity**), not (…, kind) as the handoff said: a recipient can legitimately get two Escalations (3 → 4 → 5) under D18(d) (R24, D19(a)).
- Demo emails are `@demo.test`, not `@demo` (R25).
- `AlertRule ↔ ChannelDestination` is an explicit join table, so the database stops a destination in use from being deleted (CR21).

## What the AI got wrong

- **Its own handoff** contradicted its own D18(d) on the Notification key (R24).
- **Plan's demo emails** fail the shared email schema (R25).
- **Prisma 7 habits:** assumed `migrate dev` regenerates the client (R26). **pnpm 12:** argon2/esbuild build scripts need approval (R27).
- **Typed `Reflector` decorator** lies about `undefined`; lint caught it (R28).
- **A supertest test** built the request before an inner `await` (R29).
- **Check-then-delete race** for destinations used by rules: the AI's first version enforced the invariant in application code at READ COMMITTED; the review caught it (CR21).
- **Timing defence with no point:** dummy argon2 on login while register openly answers 409 (CR24).
- **Process slip:** when folding the migration, a careless edit changed `User.rules` instead of `ChannelDestination.rules`; caught by reading the result before migrating. Prisma then refused the AI-triggered `migrate reset` without explicit human consent. The AI did not work around it: the migration file was produced with `prisma migrate diff`, and checked on a separate throwaway database (`sonrisa_s3check`). The human's dev database needs a reset (see notes).

## Independent review

`/code-review` (high) gave 10 findings (CR21–CR30): 6 accepted and fixed, 1 accepted as a trade-off (dummy hash removed, enumeration documented), 1 deferred to S5 with a reason (SSRF on webhook URLs, which has to be checked at send time), 2 rejected with reasons.

## Reality checks

- Built API (`node dist/main.js`) with the seeded data: login as `Alice@Demo.test` (mixed case) → token; `/me`, `/rules`, `/destinations` return only Alice's data and no hash; Alice on `/admin/event-sources` → 403; admin → 200 with the three sources; an invalid rule body → 400 with per-field issues.
- Fresh database: `pnpm db:migrate` applies the single migration; `pnpm db:seed` twice → no duplicates; all e2e green.
- Mutation checks (R30): dropping `userId` from destination get/update, rule delete, or the CR15 count, or letting `RolesGuard` ignore the role, each fails 1–3 e2e tests. Removing the HS256 pin survives, because jsonwebtoken 9 already rejects `alg: none` with a secret (checked in node); kept as defence in depth.

## AI-shortcut checklist

- [x] Role/auth checks on the server: global `AuthGuard` (default-deny) + `RolesGuard`; `/admin` is admin-only at class level; role re-read from the DB (e2e: demoted admin → 403 with the same token).
- [x] No `any`, no `@ts-ignore`. `as const` only. JWT payload and DB Severity go through zod (`tokenPayloadSchema`, `severitySchema.parse`) instead of casts. `getRequest<RequestWithUser>()` is Nest's generic accessor; the guard is what sets `user`.
- [x] No swallowed errors: the one `catch {}` in `AuthGuard` turns any JWT verification failure into a 401, with a comment; Prisma errors are mapped by code (P2002/P2003/P2025) and everything else rethrown.
- [x] Tests check behaviour: e2e against real Postgres, asserting the database is unchanged after refused writes; the mutation checks above.
- [x] External APIs checked: argon2 hash/verify in node; `jsonwebtoken` behaviour with `alg: none`; Prisma 7 `migrations.seed` from its config typings; `z.email()` on `admin@demo`.
- [x] No invented library APIs: `@nestjs/jwt` 12 (`verifyAsync`, `registerAsync`), `Reflector.createDecorator` (+ `.KEY`), Prisma `update/delete` with non-unique filters, `AlertRuleGetPayload` all checked by typecheck against installed versions.
- [x] Glossary terms: `AlertRule`, `ChannelDestination`, `EventSource`, `Event`, `EventRevision`, `Notification` (`kind: match | escalation`), `Severity`, Freshness Window (`freshnessHours`).

## Gate output (final run)

```
$ pnpm generate && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e && pnpm build
packages/shared typecheck: Done · apps/web typecheck: Done · apps/api typecheck: Done
$ eslint . --max-warnings=0        (no problems)
All matched files use Prettier code style!
packages/shared test:  Tests  116 passed (116)
apps/api test:         Tests  2 passed (2)
apps/web test:         Tests  4 passed (4)
apps/api test:e2e:     Test Files  3 passed (3)   Tests  38 passed (38)
build: shared Done · api Done · web ✓ built
gates exit=0
```

(e2e run against a freshly migrated database, `DATABASE_URL=…/sonrisa_s3check`.)

## Notes for later sessions

- **Local dev DB:** if it was migrated during S3 before the migration was folded, run `pnpm --filter @sonrisa/api exec prisma migrate reset --force` once (re-applies migrations and seeds). `.env` now needs `JWT_SECRET` (see README).
- **S4:** Events/Revisions/EventSources exist; adapters write `severity` as an Int validated with `severitySchema`. Admin routes go on `AdminController` (class-level `@Roles(['admin'])`).
- **S5:** insert Notifications with `severity` = the Event Severity at decision time; the unique key is (user, event, destination, severity). `alreadyNotified` = max `severity` per (userId, destinationId) for the Event. A `destinationId` can be NULL on old rows (destination deleted): skip those. **SSRF (CR23):** before POSTing to a webhook URL, allow only `hooks.slack.com` and the configured Stand-in origin (resolve and check the IP at send time). The seeded Stand-in URL is `http://localhost:4010/hooks/world-alerts` (`SLACK_STANDIN_WORLD_ALERTS_URL` in `src/seed/seed.ts`): change it there if the Stand-in uses another port. Grow `channels/channel-configs.ts` into the `ChannelProvider` registry.
- **S6:** the 400 body is `{ message, issues: [{ path, message }] }` for every validation error; 409 on destination delete includes `ruleIds`.
