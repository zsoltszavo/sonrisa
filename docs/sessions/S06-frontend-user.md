# S6 — Frontend: user experience (retro)

**Goal:** a polished UI for owning alerts. **Done when:** component tests for the rule editor and the schema form; a manual run with screenshots. The human added: make the app look like **sonrisa.hu** (logo, typography, padding, styling).

## Visual direction (settled first)

Taken from sonrisa.hu's own stylesheet rather than guessed (R46, D22(a)):

| Token | Value | Use |
|---|---|---|
| Forest | `#032c13` | headings, text on mint, focus outlines, selected states |
| Mint | `#8ee4a9` | primary buttons, active nav underline, chips |
| Mist | `#f1f9ee` | header bar, empty states, preview panel |
| Graphite | `#2e2e2e` | body text |
| Lime | `#7dcf3d` | logo mark only (too light for text) |
| Severity ramp | `#c2d0c2` · mint · `#f5c645` · `#fe602f` · `#b3261e` | the site's green/yellow/orange accents, matching GDACS Green/Orange/Red |

- **Type:** Unbounded (500) for headings, nav and numbers, standing in for the licensed Benzin; Courier New for body, labels and buttons, as on the site. No all-caps labels.
- **Layout:** mist header with the site's 22/29 px padding round the lockup and 30 px gutters (15 px on phones); the 932 px page wrapper (the rule editor widens to 1200 px for its preview column); page headers copy the site's "title left, paragraph right" block. Square corners everywhere except pill chips, as on the site.
- **The one bold element:** the Severity slider: a forest track with a square mint thumb over a five-tile colour ramp, with the hint in the source's own terms ("M6 and above").
- **Changed from the site:** muted grey `#9e9e9e` → `#5b655e` (AA contrast); mint buttons get forest text, not the site's white (white on mint is 1.6:1).

## What was built

- **Data layer** (`apps/web/src/lib`): `api.ts` (typed client; every answer parsed with a shared schema; `ApiError` with the server's issues), `session.ts` (token in localStorage, synced across tabs), `auth.tsx`, `queries.ts` (TanStack Query hooks; mutations invalidate what they change), `schema-config.ts` (JSON Schema → fields + client checks), `rule-preview.ts`.
- **Routes:** `/login`; `RequireAuth` / `RedirectIfSignedIn` guards (UX only: the server checks every request) returning to the deep link; `/notifications`, `/rules`, `/rules/new`, `/rules/:ruleId`, `/destinations`, a 404 page.
- **Rule editor:** Category as a radio group; the Severity slider (native range input, `aria-valuetext` like "4 or higher, Severe: M6 and above"); keyword chips (Enter, comma or paste; Backspace removes; dedupe ignores case and accents) with per-Category suggestion chips; destination checkboxes; a **live preview** with the shared `eventMatcher` over `GET /events/recent`, plus a one-line count beside the controls on phones. Server 400 issues land on their field.
- **Destinations:** list, add/edit dialog whose config fields come from `GET /channels` JSON Schema (unsupported schemas are refused, not guessed), "Send test" with the result inline, delete with the 409 explained.
- **My notifications:** newest first, Severity tile, source link, destination ("a deleted destination" when gone), delivery status; **Escalations get an ember side bar and "Escalated to 4 · Severe"**. Refreshes every 30 s.
- **States and a11y:** every page has loading (`role=status`), empty (an action to take next) and error (`role=alert` + Try again) states; skip link; visible focus; labelled fields with `aria-describedby` for hints and errors; reduced motion respected.
- **API/shared:** `GET /events/recent`, `GET /me/notifications` (+ `(userId, createdAt)` index, migration `20261004190000_s6_my_notifications_index`), titles/formats in Channel schemas, `severityHint`, `KEYWORD_SUGGESTIONS`, `SEVERITIES`, `notificationKindSchema`/`notificationStatusSchema` (replacing the hand-written `NotificationKind`), `validationErrorBodySchema`.

## Deviations from the plan / handoff

- **The dev database wasn't reset** (the human's choice, R49): this session used a new `sonrisa_s6` database; your `sonrisa` database still has the S3 drift.
- The migration was written by hand (`migrate dev` wanted a reset because of that drift); it is a single `CREATE INDEX`.
- The S1 `HomePage` scaffold is gone; its health check lives on as `HealthBadge` in the footer (its tests moved with it).
- `react-hook-form` is used for sign-in and the rule editor (D13); the destination dialog uses plain state because its fields are dynamic.

## What the AI got wrong

- Wrote the form against an assumed schema shape; the real `GET /channels` had no titles (R48). Checked with curl before building, so this was caught early.
- Took `shadcn add` output without reading it: a `next-themes` dependency for a light-only Vite app (R47).
- Layout bugs only visible in screenshots: per-word wrapping on the login headline, overlapping Severity labels and an overflowing nav on phones, the preview out of sight on phones (R51); `sr-only` radios escaping their labels (R53).
- Real bugs found by `/code-review`: a multi-keyword paste kept only the last keyword (CR50); server issues for fields not on screen failed silently (CR52); a redirect race after sign-in (CR53); a late 401 could end a newer session (CR54); unencoded ids in API paths (CR56).
- Ran the dev API on the same database as the e2e suite, so its worker took the e2e jobs (R50).

## Independent review

`/code-review` (high) on the full session diff: 10 findings, CR50–CR59. 9 accepted, 1 partly accepted (CR55: the shared preview hook and memo fixes, but not measured as a real slowdown). Each has a test where behaviour changed.

## Reality checks

- API (`pnpm dev`, `DATABASE_URL=…/sonrisa_s6`, live USGS/GDACS pollers) + Vite; demo data via the admin Simulated Source (Japan/Chile/Indonesia quakes; an OPEC news item revised 3 → 4 to produce an Escalation, delivered to Mailpit).
- Screenshots via headless Chrome (`docs/evidence/s06/`): sign-in, My notifications with an Escalation, Alert rules, the editor's live preview (the "Tokyo" keyword matching "Tōkyō"), keyword chips + slider, send test, a server-side Slack allowlist error shown on the field, and the editor and feed at 390 px.
- `vite build` passes (Vite warns about a 500 kB+ chunk: next step, route-level code splitting).

## AI-shortcut checklist

- [x] Role/auth checks on the server: guards are UX only; `/events/recent` and `/me/notifications` sit behind the global AuthGuard (401 e2e) and `/me/notifications` is scoped by `userId` (e2e: bob sees none of alice's).
- [x] No `any`, no `@ts-ignore`. Remaining `as`: `as const`; `JSON.parse(…) as unknown` and spreading a recorded request body in test helpers; shadcn's generated `as React.CSSProperties` for CSS custom properties in `ui/sonner.tsx`. An e2e `.body as {id}[]` was replaced by parsing with `alertRuleSchema`.
- [x] No swallowed errors: every `catch` either shows the error (toast, alert, field) or has a comment (localStorage blocked → in-memory token; the confirm dialog's caller already toasted).
- [x] Tests check behaviour (rendered text, requests sent, where the router went); 6/6 mutations caught (R52).
- [x] External facts checked: sonrisa.hu CSS and assets read directly; Channel schemas from the running API; zod `.meta()` output checked with curl.
- [x] No invented APIs: `createMemoryRouter`, RHF `useWatch` with name arrays, `zodResolver` issue `type`, zod `keyof()` all run in tests.
- [x] Glossary terms in the UI: Event, Category, Severity, Alert rule, Keyword, Channel, Destination, Escalation, Notification.

## Gate output (final run)

```
$ pnpm typecheck
apps/slack-standin typecheck: Done
packages/shared typecheck: Done
apps/api typecheck: Done
apps/web typecheck: Done
$ pnpm lint
$ eslint . --max-warnings=0
(no problems; first run caught one unused parameter in a new test, fixed and re-run)
$ pnpm format:check
All matched files use Prettier code style!
$ pnpm test
apps/slack-standin test:  Test Files  2 passed (2)
apps/slack-standin test:       Tests  22 passed (22)
packages/shared test:  Test Files  9 passed (9)
packages/shared test:       Tests  123 passed (123)
apps/api test:  Test Files  8 passed (8)
apps/api test:       Tests  67 passed (67)
apps/web test:  Test Files  7 passed (7)
apps/web test:       Tests  33 passed (33)
$ pnpm test:e2e (DATABASE_URL=…/sonrisa_s6)
 Test Files  6 passed (6)
      Tests  79 passed (79)
```

## Notes for later sessions

- **Database:** this session ran everything on `postgresql://sonrisa:sonrisa@localhost:5433/sonrisa_s6` (migrated + seeded + demo Events). The default `sonrisa` database still needs `prisma migrate reset` (S3 note): **you** decide.
- **Don't run the dev API on the database the e2e suite uses** (R50): its worker takes the e2e jobs. Stop it, or point e2e at another database.
- **S7:** reuse `PageHeader`, `PageWidth`, `States`, `SeverityBadge`, `ConfirmDialog`, the query-key pattern and `mockApi`/`renderAt` (`src/test/render.tsx`). Add an "Admin" nav item only for `role === 'admin'` (UX only). `GET /events/recent` exists, but the explorer needs filters (source, time) and a detail endpoint with revisions + Notifications.
- **S8:** a Webhook provider needs `.meta({ title, description })` on its config fields for a good form; nothing else on the frontend (the form refuses non-string properties, so keep config fields as strings).
- **Next steps:** route-level code splitting; an httpOnly cookie session instead of localStorage; pagination for My notifications beyond 100.

## CI

Commit `c29dbc3`: GitHub Actions run [37221924138](https://github.com/zsoltszavo/sonrisa/actions/runs/37221924138), job "typecheck · lint · test · build": **success**.
