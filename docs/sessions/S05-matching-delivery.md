# S5 — Matching & delivery (retro)

**Goal:** Events become delivered messages. **Done when:** a Simulated Event shows up as an email in Mailpit **and** a message in the Slack Stand-in (screenshots); a simulated upgrade sends an Escalation in both; a contract test pins the Slack payload to the documented webhook format.

## What was built

- **`NotificationPlanner`** subscribes to `EventIngested`. Inside the Event's transaction (D20(a)) it runs `isFresh` with the source's `freshnessHours`, narrows rules by Category and Severity in SQL, and calls `decideNotifications` with `alreadyNotified` = the highest Severity per (user, destination). It then inserts the Notifications (`createManyAndReturn`, `skipDuplicates`) and **their pg-boss jobs on the same transaction** (ADR 0002).
- **`DeliveryQueue`** (pg-boss 12): jobs are written through a `Db` adapter over `tx.$queryRawUnsafe`. One job = one attempt. pg-boss's own retry only covers crashes.
- **`DeliveryService`**: claims an attempt with one conditional `update` (`pending`, attempts < 3) and sends through the registry. `sent` is written only after the Channel accepted the message. A retryable failure schedules the next job (backoff `base · 2^(n−1)`, lengthened by 429 `Retry-After`, capped at 1 h). A permanent failure, or the 3rd attempt, marks the Notification `failed`. Admin retry: `POST /admin/notifications/:id/retry` (202; 409 unless `failed`). Delivery is at-least-once (D21(a)).
- **Channels** (`apps/api/src/channels/`): `ChannelProvider<Config>` + `ChannelRegistry`, which grew out of `channel-configs.ts`. Each provider is registered with its config type sealed in, so no caller casts a config. The registry re-validates stored configs before every send.
  - **Email:** Nodemailer → Mailpit, HTML + text, the same Message-ID on resends, SMTP 5xx = permanent.
  - **Slack:** an Incoming Webhook with `header`/`section`/`context` blocks within Slack's documented limits, everything escaped, and a fallback `text`. It handles Slack's status codes and `Retry-After`, and doesn't follow redirects. **SSRF guard (CR23):** only `https://hooks.slack.com/services/…` or the `SLACK_STANDIN_URL` origin, on save and before every send.
- **`GET /channels`**: each Channel with its config as JSON Schema (`z.toJSONSchema`, `io: 'input'`) for the S6 forms. **`POST /destinations/:id/test`** sends right away and answers `{ delivered, error? }`.
- **Slack Stand-in** (`apps/slack-standin`, in docker compose on 4010): plain Node 24 TypeScript with no dependencies. It checks payloads against the webhook contract strictly (unknown blocks and fields → `invalid_payload`), answers Slack's plain-text codes, and shows a Slack-like view of the `sonrisa` workspace (labelled "not a real Slack workspace"). It has `GET/DELETE /api/messages` and `POST /api/failures` to inject 429/5xx.
- **Shared:** `SEVERITY_LABELS`, `channelInfoSchema`, `testDeliveryResultSchema`. CI gets a Mailpit service; the e2e suite starts its own Stand-in on 4011.

## Deviations from the plan / handoff

- **Retries are scheduled by the app, not by pg-boss** (D21(a)): pg-boss can't take a per-failure delay, so it couldn't honour `Retry-After`.
- **No DNS/IP check for webhooks** (the S3 note asked for one): an exact host allowlist, re-checked before every send, with redirects off. Reason in D21(c).
- **`SLACK_STANDIN_URL` defaults to empty** (CR43); `.env.example` sets it for development.
- `PrismaService` now disconnects in `onApplicationShutdown`, so the worker and the poller can drain first (D21(h)).

## What the AI got wrong

- **Its own bugs, caught by its own tests:** `Date.parse('-5')` is a year (R40); Zod 4 refinements run after a failed URL check (R41); a raw `ZodError` was logged for a config that no longer validates (R42); an e2e test that forgot the seeded rules (R43).
- **Tests that proved less than they claimed** (R44, found by mutation): the send-time host check existed twice, so neither copy was tested; the Retry-After test couldn't tell 1 s from 3 s, the second time because worker polling jitter hid it. It now asserts the scheduled job's `start_after`.
- **Review findings on its own design** (CR40–CR45, CR47): an interrupted last attempt left a Notification `pending` forever; an unescaped Slack fallback text (`<!channel>`); the Stand-in allowed in every environment by default; Escalations counting undelivered Severities; truncation that could break Slack's limits or split an entity.

## Independent review

`/code-review` (high) gave 10 findings (CR40–CR49): 7 accepted and fixed (with tests where they change behaviour), 1 partly accepted (CR41), 2 rejected with a reason (CR46, CR49).

## Reality checks

- **End to end:** the built API (`node dist/main.js`) on a seeded throwaway database, with the docker Mailpit and Stand-in. A Simulated Event M6.4 (Severity 4), revised to M7.1 (5), gave 4 Notifications, all `sent` on the first attempt: a match and an Escalation each in Mailpit and in `#world-alerts` (R45).
  - `docs/evidence/s05/mailpit-inbox.png`, `docs/evidence/s05/mailpit-escalation-email.png`, `docs/evidence/s05/slack-standin-world-alerts.png`
- **Mutations** (R44): 7 of 7 caught after the two test fixes.
- **Library and API facts:** pg-boss in a Prisma transaction checked by a spike (R37); Nodemailer 10 vs `@types/nodemailer` 8 (R38); Slack docs (R39).

## AI-shortcut checklist

- [x] Role/auth checks on the server: the retry route is on `AdminController` (class-level `@Roles(['admin'])`; e2e: 403 for a user). "Send test" is scoped by owner (e2e: another user gets 404). `GET /channels` needs a sign-in (e2e: 401).
- [x] No `any`, no `@ts-ignore`, no unexplained `as`: only `as const` in the Slack renderer. Job data is parsed with zod; DB Severities go through `severitySchema`; SMTP errors are parsed with zod. The registry seals each provider's config type, so nothing casts a config.
- [x] No swallowed errors: every failure ends in `lastError` and a log line. The two `catch` blocks that don't rethrow (an unparsable Slack error body; not-JSON in the Stand-in) say why.
- [x] Tests check behaviour: e2e against real Postgres, real SMTP (Mailpit) and a real Stand-in process. 7 mutations caught.
- [x] External API fields checked against reality: Slack docs (R39), Mailpit's API probed with curl, the pg-boss/Nodemailer typings.
- [x] No invented library APIs: pg-boss `insert`/`work`/`createQueue`/`stop` options read from its `types.d.ts` and spiked; Zod `toJSONSchema` and `abort` tried in node; Prisma extended unique `where` checked by typecheck and e2e.
- [x] Glossary terms: Notification, Escalation, Channel, Channel Destination, Freshness Window, Slack Stand-in, Severity labels in messages.

## Gate output (final run)

```
$ pnpm generate && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e && pnpm build
apps/slack-standin typecheck: Done · packages/shared typecheck: Done · apps/web typecheck: Done · apps/api typecheck: Done
$ eslint . --max-warnings=0        (no problems)
All matched files use Prettier code style!
packages/shared test:   Tests  116 passed (116)
apps/slack-standin test: Tests  22 passed (22)
apps/api test:          Test Files  8 passed (8)   Tests  67 passed (67)
apps/web test:          Tests  4 passed (4)
apps/api test:e2e:      Test Files  5 passed (5)   Tests  74 passed (74)
build: shared Done · api Done · web ✓ built
gates exit=0
```

(e2e run against a freshly migrated and seeded database, `DATABASE_URL=…/sonrisa_s5check`, with the docker Mailpit.)

## Notes for later sessions

- **Your local `.env`:** add `SLACK_STANDIN_URL=http://localhost:4010` (now in `.env.example`). Without it only real Slack URLs are allowed, so the seeded `sonrisa · #world-alerts` destination fails with "Destination config is not valid". Run `docker compose up -d --build` once to start the Stand-in. The S3 note's `prisma migrate reset` is still pending for the dev database.
- **S6:** build destination forms from `GET /api/channels` (`configSchema` is JSON Schema; the host allowlist is checked by the server only, so show the 400 `issues`). "Send test" is `POST /api/destinations/:id/test`, which answers `{ delivered: false, error }` with status 200. `SEVERITY_LABELS` is in shared. There is no "my notifications" endpoint yet: add `GET /me/notifications`.
- **S7:** the Notification log needs a list endpoint (`GET /admin/notifications` with status filter); retry exists. `lastError` is kept until a send succeeds. Failure injection for the demo: `curl -XPOST localhost:4010/api/failures -d '{"status":429,"retryAfter":5,"count":1}'`.
- **S8:** a new provider = a class implementing `ChannelProvider<Config>` + one line in `ChannelRegistry`'s constructor + the module's `providers`. Watch the diff stat for anything else.
- **Next steps:** the delivery worker and the poller assume one API instance only loosely (pg-boss itself is multi-instance safe); a dead-letter view; real SMTP.
