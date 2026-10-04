# S7 — Frontend: admin view (retro)

**Goal:** the four admin capabilities (D10). **Done when:** an admin can run the full demo script from the UI alone, and non-admin users never see admin routes (the server returns 403 anyway). The human added: keep reusing the sonrisa.hu design from S6.

## What was built

- **API** (all under the class-level `@Roles(['admin'])`, D23(a)):
  - `GET /admin/events`: Event explorer filters `source`, `category`, `minSeverity` (≥), `from`/`to` on `occurredAt` (ISO 8601 with offset, inclusive, `from ≤ to`), `limit` 1–500 (default 100). Newest first, each row with `notificationCount`.
  - `GET /admin/events/:id`: the Event, its `EventRevision`s oldest first, and the newest 200 Notifications it caused (who, destination, status, attempts, last error). 404 when missing.
  - `GET /admin/notifications`: the log, with an optional `status` filter.
  - Shared: `admin.ts` (query and response schemas); `dateSchema` and `MAX_DELIVERY_ATTEMPTS` are now exported once and reused (CR68, CR69).
- **Web** (`apps/web/src/routes/admin`, `components/AdminLayout.tsx`, `components/AdminNotificationList.tsx`):
  - **Guard and nav:** an "Admin" item in the main nav only for `role === 'admin'`; `RequireAdmin` sends anyone else to `/notifications` (UX only). The Admin area has its own second nav row (lime square, mint underline like the main nav).
  - **Event Sources:** Enabled/Disabled badge with a toggle, polling interval and Freshness Window (sends only the changed fields; server issues land on the field), last poll time with success or the error text, and **Poll now** with its counts (fetched/new/updated/unchanged/ignored/skipped/failed). The Simulated Source shows "Never polled" and no polling controls.
  - **Simulator:** the create form (Category, Severity with labels, title, summary, location, link; server issues on their field). The recent simulated Events list and the selected Event are kept in `?event=`. The selected Event has a five-tile **Change Severity** picker that says beforehand whether the change sends an Escalation or stays silent, plus its Severity history and Notifications, polled every 2 s so the **Escalation appears live**.
  - **Event explorer:** filters (source, Category, minimum Severity, occurred from/until) kept in the URL and read defensively (invalid values dropped; an inverted range is ignored and explained, CR63). **Event detail** shows the summary, source id, stored/changed times, the Severity history ("Raised from 3 to 4"), the Notifications it caused, and a link back to the Simulator for simulated Events.
  - **Notification log:** status pills (All/Pending/Sent/Failed); each row shows status, Match or Escalation, attempts ("Not attempted yet" / "Attempt n of 3"), the Event (linked), recipient and destination, and the last error. Failed rows have **Retry**; a retried row labels its old error "Previous error" (CR66).
  - Every page has loading (`role=status`), empty (with a next step) and error (`role=alert` + Try again) states. Native `<select>`s (`NativeSelect`) for keyboard and screen-reader behaviour. Filter links use `aria-current`, and the live areas use `aria-live`.

## Visual direction

Unchanged from S6 (D22(a)): forest, mint and mist; Unbounded headings; Courier New body; square buttons and tiles; the same PageHeader "title left, paragraph right" block. Admin-specific choices (D23(e)): every admin page uses the 1200 px wrapper so the admin nav lines up; status badges are small square tiles (Sent mint, Pending mist, Failed red); status filters are pills, the site's one rounded exception; Escalations keep the ember side bar from My notifications; the selected simulated Event sits in a forest-bordered mist panel.

## Deviations from the plan / handoff

- The dev API ran on a **new `sonrisa_s7` database** (migrated and seeded), not `sonrisa_s6`, so screenshots show demo data instead of e2e rows and the dev worker never shares a database with e2e (S6 note R50). `sonrisa_s6` stays the e2e database. It also got three demo Events from a stale API process (R54).
- `RequireAdmin` redirects instead of showing a 403 page (D23(d)).

## What the AI got wrong

- A process-kill pattern that missed the compiled API, so the demo data went to the wrong database (R54).
- An e2e test that passed in Vitest but didn't type-check (R55).
- Layout bugs found only in screenshots: misaligned admin nav, "1 minute ago : OK", a stretched button, truncated titles on phones (R56).
- From `/code-review`: an inverted time range shown as a server error, polling that never stopped on a 404, an unbounded detail list, misleading "Attempt 0 of 3" plus an old error after a retry, and duplicated constants and schemas (CR63–CR69). The lost-toast race (CR60–CR62) was fixed but could not be reproduced in jsdom.

## Independent review

`/code-review` (high) on the full session diff: 10 findings, CR60–CR69. 6 accepted, 2 accepted as plausible (not reproduced), 1 partly accepted (CR65), 1 rejected with reasons (CR67).

## Reality checks

- Dev API (`DATABASE_URL=…/sonrisa_s7`, `SLACK_STANDIN_URL=http://localhost:4010`, live USGS/GDACS pollers) + Vite + Mailpit + Slack Stand-in. The demo was driven through the UI by headless Chrome over CDP, clicking the real buttons (R57).
- Screenshots in `docs/evidence/s07/`: `01` Event Sources, `02` Poll now result, `03` choosing Severity 4 (with the Escalation hint), `04` the Escalation appearing live in the Simulator, `05` Event detail with history 3 → 4, `06` explorer filtered (simulated, ≥ 3), `07` the failed Slack delivery in the log, `08` the log after a successful retry, `09` Simulator at 390 px, `10` Alice (non-admin) after visiting `/admin/events`: My notifications, no Admin nav, with the Escalation.
- `curl` as Alice: `GET /api/admin/events` → **403**.

## AI-shortcut checklist

- [x] Role checks on the server: the three new routes inherit the class-level `@Roles(['admin'])`; e2e checks 401 and 403 on each (`it.each`). The UI guard is UX only.
- [x] No `any`, no `@ts-ignore`. Remaining `as`: `as const` only, plus `as const` literals in a test fixture. A cast on `Object.keys` was removed before it landed.
- [x] No swallowed errors: every mutation either shows a toast/field error or (create form) puts issues on fields; `mutateAsync(...).then(ok, fail)` always has a rejection handler.
- [x] Tests check behaviour (requests sent, rendered text, URL, redirects); 7/7 mutations caught (R58). CR62's test checks the feedback but, honestly, does not prove the race.
- [x] External facts: TanStack v5 `MutationObserver` read for CR60; Prisma `_count`/`take` on relations and zod `.pipe()` all run in e2e; the Stand-in's `/api/failures` contract read from its source.
- [x] No invented APIs: `refetchInterval` as a function of the query, `useSearchParams` functional updates and `createMemoryRouter` all run in tests.
- [x] Glossary terms in the UI: Event, Event Source, Simulated Source, Freshness Window, Category, Severity, Escalation, Notification, Alert Rule, Keyword, destination.

## Gate output (final run)

```
$ pnpm typecheck
apps/slack-standin typecheck: Done
packages/shared typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
$ pnpm lint
$ eslint . --max-warnings=0
(no problems)
$ pnpm format:check
All matched files use Prettier code style!
$ pnpm test
apps/slack-standin test:       Tests  22 passed (22)
packages/shared test:       Tests  123 passed (123)
apps/api test:       Tests  67 passed (67)
apps/web test:       Tests  52 passed (52)
$ pnpm test:e2e (DATABASE_URL=…/sonrisa_s6)
 Test Files  7 passed (7)
      Tests  88 passed (88)
```

(An earlier `pnpm typecheck` run was killed with SIGKILL while two dev servers were running; re-running it reported R55's real errors.)

## Notes for later sessions

- **Databases:** `sonrisa_s7` = dev/demo (seeded; has the OPEC+/Cyclone/Forint demo Events), `sonrisa_s6` = e2e. The default `sonrisa` DB still has the S3 drift: **you** decide on `prisma migrate reset`.
- **Slack Stand-in in dev:** `.env` has no `SLACK_STANDIN_URL`, so the seeded `#world-alerts` destination fails ("must be a Slack Incoming Webhook") unless the API starts with `SLACK_STANDIN_URL=http://localhost:4010` (as `.env.example` says). Worth a line in the README demo script (S9).
- **S8:** a Webhook destination's Notifications show up in the log with no admin change (the channel is a plain string).
- **S9 / next steps:** pagination for the explorer and the log beyond the limit; user management and an overview dashboard (D10); SSE instead of 2 s polling if the console ever needs it; route-level code splitting (Vite still warns about chunk size).

## CI

Commit `83dd33c`: GitHub Actions run [37223881832](https://github.com/zsoltszavo/sonrisa/actions/runs/37223881832), job "typecheck · lint · test · build": **success**.
