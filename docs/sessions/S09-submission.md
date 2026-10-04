# S9 — End-to-end, hardening, submission (retro)

**Goal:** a submission that can be reviewed. A browser test of the core loop, a final full-repo review and checklist, a README that describes what exists and how to demo it, and screenshots.

## What was built

- **`e2e/`** (new workspace, Playwright 1.63): `tests/alert-flow.spec.ts` drives the real UI.
  1. alice signs in, adds a Slack destination to a Stand-in channel unique to the run, and creates a Markets rule with a Keyword unique to the run, sent to *My email* and that destination.
  2. The admin simulates a matching Severity 5 Event.
  3. The email is checked in Mailpit (`/api/v1/search`) and the Block Kit message in the Stand-in (`/api/messages`).
  4. The admin Notification log shows both as **Sent**, and alice's *My notifications* shows both as **Delivered**.
  5. Afterwards it deletes its rule and destination through the API.
  - `playwright.config.ts` starts its own Slack Stand-in (4014), the built API (3100; migrate + seed first) and Vite (5174). A dev stack on 3000/5173/4010 can keep running. It refuses to start without an explicit `DATABASE_URL` (CR81).
  - `EVIDENCE_DIR=<dir>` saves screenshots along the way. That is how `docs/evidence/s09/` was made.
  - CI: installs Chromium, runs `pnpm test:browser` after the API e2e, and uploads the report on failure.
- **README** rewritten: what was built, the run (`pnpm demo` after a one-time `.env` + install), an 8-step demo script with the Slack Stand-in and Webhook receiver env lines, the test commands, the API, how to read the process docs, and known limitations linking `docs/next-steps.md`.
- Root scripts `demo` (compose up → migrate → seed → dev) and `webhook-receiver`. `.env.example` now sets `WEBHOOK_ALLOWED_ORIGINS=http://localhost:4012`, so the demo's Webhook step works out of the box (dev only, like `SLACK_STANDIN_URL`; the README says to leave both empty in a real deployment).
- `docs/next-steps.md` gets the items S7 and S8 deferred (pagination, SSE, code splitting, HMAC signing, per-Channel icon, private-target switch).

## Deviations from the plan / handoff

- The browser test runs on `sonrisa_s6` locally (the e2e DB, as the handoff said) and on CI's `sonrisa`. It is a separate script (`test:browser`), not part of `test:e2e`, because `pnpm -r` would run it in parallel with the API e2e on the same database.
- The README demo was checked on a fresh database (`sonrisa_s9`) through the API, not by clicking every step. The UI path of steps 1–5 is what the Playwright test covers. Step 7 (stopping the Stand-in to see retries and **Failed**) wasn't re-run: D21's retry and permanent-failure paths are covered by the API e2e tests.
- No GIF, only screenshots.

## What the AI got wrong

- **R62**: it assumed signing in always lands on `/notifications`. It returns to the previous session's page.
- **R63**: its first mutation was too weak (it only broke keyword-less rules), so the passing test "proved" nothing until the mutation was fixed.
- **R64**: the README draft, written from memory, had four wrong facts (two routes, a decision number, a refresh interval). It was corrected by checking against the code.
- From `/code-review` on the Playwright commit (CR79–CR91): the `'Delivered'` substring also matching "Not delivered", a race with the 10 s refetch, no guard against seeding the demo database, a cleanup that could silently do nothing.
- **R65**: the new D25 e2e test reused a subscriber name, which broke another test's channel check.

## Independent review

1. **`/code-review` (high) on the Playwright commit**: 13 findings (CR79–CR91). 8 accepted or partly accepted, 5 rejected with reasons. The `/code-review` skill reviewed only the latest commit even with paths given, so a second reviewer did the full-repo pass.
2. **Final full-repo review** (a separate agent; it was told about CR1–CR78 so it wouldn't repeat them): 8 findings (CR92–CR99) and the checklist.
   - The important one is **CR92**: the Freshness Window silently swallowed GDACS upgrades, which defeats ADR 0001 for the one real source that escalates over days. Fixed as **D25**, with an e2e test and a mutation that fails it.
   - **CR93**: "Send test" leaked internal IPs.
   - **CR94**: pg-boss had no spare run for the CR40 path.
   - **CR95**: deferred to next-steps, because the obvious fix sends duplicates.
   - The rest are UI copy and counts.

Fixes are in the "Final review fixes" commit.

## Reality checks

- **Playwright** on `sonrisa_s6`: passes in about 8 s (about 18 s with server start). Screenshots `docs/evidence/s09/01–06`: alice's rule form, the Simulator, the admin log, *My notifications*, the Mailpit inbox and the Stand-in channel.
- **Mutation (R63)**: the Category check inverted makes it fail at Mailpit.
- **CI**: run [37226147115](https://github.com/zsoltszavo/sonrisa/actions/runs/37226147115) (commit `84e0ae3`) ran the browser test green on GitHub Actions.
- **`pnpm demo` on a brand-new DB** (R64): migrate created it, the seed ran, health 200. Each demo step was checked through the API: SSRF refusal; both tests delivered; Match ×3 and Escalation ×3 across email, Slack and Webhook.

## AI-shortcut checklist (whole repo)

- [x] Role/auth on the server: `AuthGuard` and `RolesGuard` are global `APP_GUARD`s, and `@Roles(['admin'])` is on the whole `AdminController`. Every rule, destination and notification query is scoped by `userId`, and destination ids on a rule are checked for ownership inside the transaction. The role is re-read from the DB on every request (full-repo review). The browser test signs in as both roles.
- [x] No `any`, `@ts-ignore`, `@ts-expect-error` or `eslint-disable` (`git grep`: the 3 `any` hits are prose). The only non-`const` cast in production code is in vendored shadcn `sonner.tsx` (CSS custom properties). Test casts are commented.
- [x] No swallowed errors. Every bare `catch` maps to a defined outcome (401, a reason string, a memory fallback). The catches that only log sit in background loops, where rethrowing would kill the loop.
- [x] Tests check behaviour: the browser test checks the real inboxes, and it and the D25 test each fail under a mutation. The weak spot the review found (the CR40 e2e drives `attempt()` by hand) is covered by CR94's config change, not by a new test.
- [x] External facts checked: Mailpit's search API and the Stand-in's `/api/messages` are used live. Playwright 1.63's `webServer` array, `toPass` and `hasNotText` all run. `actions/upload-artifact@v7` was checked against its releases. Playwright's CI docs back CR89.
- [x] No invented APIs: everything new runs in a test or in CI.
- [x] Glossary: CONTEXT's Channel entry now lists `webhook`. UI copy says "alerts" and "destinations" on purpose, as plain words for Notification and Channel Destination (CR99).

## Gate output (final run)

```
$ pnpm typecheck        (apps/slack-standin, packages/shared, e2e, apps/api, apps/web: Done)
$ pnpm lint             eslint . --max-warnings=0 (no problems)
$ pnpm format:check     All matched files use Prettier code style!
$ pnpm test
packages/shared        Tests  123 passed (123)
apps/slack-standin     Tests  22 passed (22)
apps/api               Tests  128 passed (128)
apps/web               Tests  52 passed (52)
$ pnpm test:e2e      (DATABASE_URL=…/sonrisa_s6)
 Test Files  8 passed (8)
      Tests  99 passed (99)
$ pnpm test:browser  (DATABASE_URL=…/sonrisa_s6)
  ✓  1 [chromium] › tests/alert-flow.spec.ts › a rule alice creates in the UI notifies her by email and Slack (8.6s)
  1 passed (18.6s)
```

## Looking back over the prompts and decisions

- Prompts 001–024 are all saved. Every session had a kickoff prompt; S1 also saved its commit approval (016). Later commits ran under the standing permission, which isn't saved as a prompt (by the human's instruction).
- Decisions D1–D25. The one gap the final review found (D15 vs ADR 0001 for updates) is now D25. D24(c) had gone out of date (CR71's port) and is corrected.

## Notes for later

- **Databases:** `sonrisa_s7` = dev/demo, `sonrisa_s6` = e2e (API and browser), `sonrisa_s9` = the throwaway one from the `pnpm demo` check (can be dropped). The default `sonrisa` DB still has the S3 drift. A fresh clone never sees it.
- The rest is in `docs/next-steps.md`.

