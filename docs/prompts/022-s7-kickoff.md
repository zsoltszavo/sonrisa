# Prompt 022 — S7 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S7 (Frontend: admin view)

## Prompt (verbatim)

```
Start session S7 (Frontend: admin view) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S6 committed as c29dbc3 + 9b70520, CI green). First read CONTEXT.md, the "Rules for every session" and "S7" sections of docs/plan.md, docs/decision-log.md (especially D10, D20, D21, D22), docs/adr/, and the "Visual direction" and "Notes for later sessions" sections of docs/sessions/S06-frontend-user.md (reuse PageHeader/PageWidth/States/SeverityBadge/ConfirmDialog and mockApi/renderAt from apps/web/src/test/render.tsx; use DATABASE_URL=postgresql://sonrisa:sonrisa@localhost:5433/sonrisa_s6 because the default dev DB still has S3 drift; never run the dev API on the database e2e uses). Save this prompt verbatim as docs/prompts/022-s7-kickoff.md in the existing prompt-file format. Then add the admin API endpoints S7 needs (GET /admin/notifications with status filter, an Event explorer list with source/category/severity/time filters, and Event detail with severity revisions and the Notifications it caused), and build in apps/web an Admin area shown only to role admin (UX only, server returns 403): Event Sources (enable/disable, interval, freshness window, last poll status/error, poll now), the Simulated Source console (create an Event; change its severity to show an Escalation live), the Event explorer, and the Notification log (status, attempts, last error, filter failed, retry), in the S6 sonrisa.hu style with loading/empty/error states. Finish with component tests, e2e tests for the new endpoints including 403 for non-admins, gates passing, screenshots in docs/evidence/s07/, an independent /code-review logged in docs/ai-review-log.md, and the docs/sessions/S07-admin-view.md retro; then commit and push (standing permission) and confirm CI is green.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's kick off S7. Remember what I've told for S7, reusing sonrisa.hu design.")

## Outcome

- API: `GET /admin/events` (source/Category/minimum Severity/time filters, `notificationCount`), `GET /admin/events/:id` (revisions + the newest 200 Notifications it caused), `GET /admin/notifications` (status filter); schemas in shared `admin.ts`; `dateSchema` and `MAX_DELIVERY_ATTEMPTS` moved to shared (D23).
- `apps/web` Admin area (nav item and routes only for admins; `RequireAdmin` redirects others): Event Sources (enable/disable, interval, Freshness Window, last poll status/error, Poll now with its counts), the Simulator (create; change Severity with the history and Notifications updating live, Escalation marked), the Event explorer (filters in the URL) with Event detail, and the Notification log (status pills, attempts, last error, retry). Loading, empty and error states throughout, in the S6 sonrisa.hu style.
- The dev API ran on a new `sonrisa_s7` database; e2e stayed on `sonrisa_s6`.
- 19 new web tests (52 total), 9 new e2e tests (88 total), 7 of 7 mutations caught; `/code-review` gave 10 findings (CR60–CR69): 6 accepted, 3 partly or as plausible, 1 rejected. Screenshots in `docs/evidence/s07/`. Retro: `docs/sessions/S07-admin-view.md`.
