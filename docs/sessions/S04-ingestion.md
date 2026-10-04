# S4 — Ingestion (retro)

**Goal:** Events flow in from all three sources. **Done when:** adapter tests run against the saved real samples in `docs/evidence/feed-samples/`, re-running the same poll creates 0 new Events, and a revised fixture creates a revision.

## What was built

- **Shared** (`event-source.ts`): `storedEventSchema`, `eventSourceSchema`, `eventSourceUpdateSchema` (interval 30 s – 24 h, Freshness Window 1 – 720 h, strict, non-empty), `simulatedEventInputSchema`, `pollResultSchema`.
- **`EventSourceAdapter`** (`apps/api/src/ingestion/adapter.ts`): `poll(signal) → { fetched, events, ignored, skipped }`. Every adapter builds Events through `eventSchema`. An invalid item becomes a skipped item and doesn't fail the batch.
  - **USGS:** `all_hour.geojson`, raw fields checked with zod, `severityFromUsgsMagnitude`, non-`earthquake` types ignored, `occurredAt` from epoch ms.
  - **GDACS:** RSS via `fast-xml-parser` (`parseTagValue: false`, prefixed names kept), drops `EQ` (D15), `severityFromGdacsAlertLevel`, `occurredAt = gdacs:dateadded`, which must carry a time zone (RFC 1123).
  - **Simulated:** nothing to poll; `build(input, externalId, occurredAt)` for the admin API.
- **`IngestionService`:** content hash over every shown field. One read of stored hashes per poll, so unchanged items open no transaction. New or changed items get one transaction each, with an optimistic update guarded by the old hash, retried on a concurrent change or P2002. Every stored Severity gets an `EventRevision`, the first one with `previousSeverity = null`. Text-only edits are Event Updates without a revision.
- **`EventIngested{event, previous}`:** a small typed bus. Handlers run **inside the Event's transaction** (D20(a)), so S5 can write Notifications and their jobs atomically.
- **`PollingService`:** a 5 s tick re-reads `EventSource` rows (D5). Due = enabled, polled, and the interval has passed since the last poll ended. An in-memory in-flight guard means the tick skips a running source and "poll now" answers 409. A 30 s timeout covers fetch and storing. It records `lastPollAt`/`lastError`, including partial problems ("2 item(s) not stored; first: …"). Shutdown aborts polls without recording them. `INGESTION_SCHEDULER=off` turns the loop off (e2e).
- **Admin API** (class-level `@Roles(['admin'])`): `PATCH /admin/event-sources/:key`, `POST /admin/event-sources/:key/poll` (400 for the Simulated Source), `POST /admin/simulated-events`, `PUT /admin/simulated-events/:id` (404 for other sources' Events, 409 while the Simulated Source is disabled).

## Deviations from the plan / handoff

- No `@nestjs/schedule` (D13): a tick that re-reads the table applies admin changes without re-registering timers (D20(b)).
- "Poll now" on the Simulated Source is a 400, not a no-op (CR38).
- One API instance is assumed: the overlap guard lives in memory (next steps: a database lease).

## What the AI got wrong

- **A scheduler test that proved nothing** (R32): disabling gdacs was asserted while gdacs wasn't due anyway. The first fix then made the interval change irrelevant. Mutation testing caught both.
- **A test that leaked a row per run** (R33): cleanup scoped to the wrong `describe`. Found by counting rows during the reality check.
- **A fake `fetch` that didn't behave like `fetch`** (R34) on an already-aborted signal, which hung the shutdown test.
- **Review findings on its own design** (CR31–CR37): shutdown writes, a tick racing shutdown, duplicate ids flip-flopping forever (would have become repeat notifications in S5), timeout not covering storage, an extra transaction for every unchanged item, and `enabled` ignored for the Simulated Source.

## Independent review

`/code-review` (high) gave 9 findings (CR31–CR39): 7 accepted and fixed with tests, 1 partly accepted (CR38), 1 rejected with a reason (CR39).

## Reality checks

- **Live feeds:** the built API (`node dist/main.js`, scheduler on) against a fresh seeded throwaway database polled USGS and GDACS with no `lastError`: 174 GDACS Events (179 items, 5 `EQ` dropped) with all three Severity levels, plus the live USGS hour. After `lastPollAt` was reset, a forced re-poll left Event and revision counts unchanged, so 0 new Events against live data too.
- **Mutations** (R35): 16 mutations, each restored from a copy; every one fails 1–6 tests.
- **Local dev database** (R36): still the pre-fold S3 schema, so the S3 `ownership` e2e suite fails there with `TableDoesNotExist`. Gates ran on a fresh `sonrisa_s4check`; the dev database still needs the reset described in the S3 notes.

## AI-shortcut checklist

- [x] Role/auth checks on the server: all new routes are on `AdminController` (class-level `@Roles(['admin'])`). e2e: a non-admin gets 403 on all four new routes and nothing changes.
- [x] No `any`, no `@ts-ignore`, no unexplained `as`. `as const` only. Feed data goes through zod (`featureSchema`, `itemSchema`, `rssSchema`). DB Severity and source key through `severitySchema` / `eventSourceKeySchema`. Test fixtures are parsed with `z.looseObject` instead of cast.
- [x] No swallowed errors: per-item failures are collected and reported in `lastError`. A failed poll is recorded and logged. The scheduler loop logs at error level and keeps going, with a comment explaining why.
- [x] Tests check behaviour: e2e against real Postgres with the real adapters, service and scheduler; only the HTTP fetch is replaced by the saved samples. The mutation results above.
- [x] External API fields checked against reality: the saved samples (field names, `EQ` count, BOM, empty tags, guids) and a live poll of both feeds.
- [x] No invented library APIs: `fast-xml-parser` 5.11 options read from its installed typings and tried in node; `AbortSignal.any` / `AbortSignal.timeout` (Node 24); Prisma `updateMany` count and `TransactionClient`, all checked by typecheck.
- [x] Glossary terms: Event, Event Source, Simulated Source, Severity, Event Update (`previous`), Freshness Window (`freshnessHours`), `EventRevision`.

## Gate output (final run)

```
$ pnpm generate && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e && pnpm build
packages/shared typecheck: Done · apps/web typecheck: Done · apps/api typecheck: Done
$ eslint . --max-warnings=0        (no problems)
All matched files use Prettier code style!
packages/shared test:  Tests  116 passed (116)
apps/api test:         Test Files  5 passed (5)   Tests  34 passed (34)
apps/web test:         Tests  4 passed (4)
apps/api test:e2e:     Test Files  4 passed (4)   Tests  64 passed (64)
build: shared Done · api Done · web ✓ built
gates exit=0
```

(e2e run against a freshly migrated database, `DATABASE_URL=…/sonrisa_s4check`.)

CI on GitHub: ✅ green on the first push of `129c2ea` (incl. `db:migrate` + e2e against the Postgres service), https://github.com/zsoltszavo/sonrisa/actions/runs/37217033666

## Notes for later sessions

- **Local dev DB:** run `pnpm --filter @sonrisa/api exec prisma migrate reset --force` once (S3 note, still pending). Set `INGESTION_SCHEDULER=off` in `.env` if you don't want the dev API calling the real feeds.
- **S5:** subscribe with `EventIngestedBus.subscribe((ingested, tx) => …)` in a provider of a module that imports `IngestionModule`. Use `tx` for every write (Notifications + pg-boss jobs) so they commit with the Event. Throwing rolls the Event back, and the next poll retries it. `previous === null` means a new Event. Read the Freshness Window from `EventSource.freshnessHours`. Simulated Events are pushed by the admin API and go through the same bus. On the first GDACS poll all ~174 Events are new: `isFresh` (6 h) is what keeps old ones from notifying.
- **S7:** `GET /admin/event-sources` returns rows matching `eventSourceSchema`. "Poll now" returns `PollResult` (409 while one runs, 400 for `simulated`). The severity history is in `EventRevision` from the first version. There is no Event list endpoint yet (the explorer adds it).
- **Next steps:** a database lease (e.g. a conditional update on `lastPollAt`) if more than one API instance ever runs.
