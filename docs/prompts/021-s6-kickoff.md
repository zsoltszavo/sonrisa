# Prompt 021 — S6 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S6 (Frontend: user experience)

## Prompt (verbatim)

```
Start session S6 (Frontend: user experience) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S5 committed as 69f4a38 + b544d84, CI green). First read CONTEXT.md, the "Rules for every session" and "S6" sections of docs/plan.md, docs/decision-log.md (especially D4, D11, D14, D18, D21), docs/adr/, and the "Notes for later sessions" in docs/sessions/S05-matching-delivery.md (GET /api/channels JSON Schema forms, POST /api/destinations/:id/test answers 200 {delivered, error?}, SEVERITY_LABELS in shared, no GET /me/notifications yet). Save this prompt verbatim as docs/prompts/021-s6-kickoff.md in the existing prompt-file format. Then load the frontend-design skill and settle the visual direction first, and build in apps/web: login, app shell with route guards, Destinations (list, add/edit with a form generated from the channel's JSON Schema, send test), the rule editor (category, severity slider with labels, keywords with per-category suggestion chips, destination picker, live preview using the shared matches() against recent Events, adding the API endpoints it needs such as recent Events and GET /me/notifications), and My notifications with Escalations marked; with loading, empty and error states and keyboard/screen-reader basics. Finish with component tests for the rule editor and schema form, gates passing, screenshots in docs/evidence/, an independent /code-review logged in docs/ai-review-log.md, and the docs/sessions/S06-frontend-user.md retro; then commit and push (standing permission) and confirm CI is green.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's kick off S6. Check sonrisa.hu for logo typography paddings and all the styling - try to make our app similar on those aspects.")

## Outcome

- Visual direction taken from sonrisa.hu's own CSS: palette, Courier New body, Unbounded standing in for the licensed Benzin, square mint buttons, the header's 22/29 px padding round a redrawn lockup, and the 932 px wrapper (D22(a)).
- `apps/web`: sign-in, app shell with route guards, My notifications (Escalations marked), Alert rules, the rule editor (Category, Severity slider with source-specific hints, keyword chips with per-Category suggestions, destination picker, live preview on the shared `eventMatcher`), and Destinations (form generated from the Channel's JSON Schema, send test, delete). Each page has loading, empty and error states.
- API: `GET /events/recent`, `GET /me/notifications` (+ index), titles and formats in the Channel schemas; shared: `severityHint`, `KEYWORD_SUGGESTIONS`, `SEVERITIES`, feed schemas, the 400 body schema.
- The human declined resetting the drifted dev database; the session used a separate `sonrisa_s6` database.
- 33 web tests, 5 new e2e tests, 6 of 6 mutations caught; `/code-review` gave 10 findings (CR50–CR59): 9 accepted, 1 partly. Screenshots in `docs/evidence/s06/`. Retro: `docs/sessions/S06-frontend-user.md`.
