# Prompt 019 — S4 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S4 (Ingestion)

## Prompt (verbatim)

```
Start session S4 (Ingestion) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S3 committed as 320af5f + 0799c50, CI green). First read CONTEXT.md, the "Rules for every session" and "S4" sections of docs/plan.md, docs/decision-log.md (especially D2, D5, D15, D18, D19), docs/adr/, and the "Notes for later sessions" in docs/sessions/S02-domain-core.md and docs/sessions/S03-persistence-auth-api.md. Save this prompt verbatim as docs/prompts/019-s4-kickoff.md in the existing prompt-file format. Then implement the EventSourceAdapter interface with USGS (GeoJSON), GDACS (RSS, drop EQ, occurredAt = dateadded, content hash) and Simulated adapters building Events through eventSchema and the shared severity mappers; a DB-driven per-source scheduler with no overlapping polls that records lastPollAt/lastError; upsert on (sourceId, externalId) with an EventRevision on Severity change and an EventIngested domain event; and admin endpoints on the existing AdminController (update sources, poll now, create/update simulated Events). Adapter tests must run against the saved samples in docs/evidence/feed-samples/, prove a repeated poll creates 0 new Events, and prove a revised fixture creates a revision. Finish with gates passing, an independent /code-review logged in docs/ai-review-log.md, and the docs/sessions/S04-ingestion.md retro; then commit and push (standing permission) and confirm CI is green.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's kick off S4.")

## Outcome

- `EventSourceAdapter` with USGS (GeoJSON), GDACS (RSS via fast-xml-parser, drops `EQ`, `occurredAt = dateadded`) and Simulated adapters, all building Events through `eventSchema` and the shared severity mappers; a content hash on every shown field.
- Idempotent upsert on (source, externalId) with an `EventRevision` for every stored Severity and an `EventIngested` domain event whose handlers run inside the Event's transaction (D20(a), for S5/ADR 0002).
- DB-driven scheduler (5 s tick, in-memory in-flight guard, `INGESTION_SCHEDULER`), admin `PATCH /admin/event-sources/:key`, `POST …/:key/poll`, `POST/PUT /admin/simulated-events`.
- 26 ingestion e2e tests + 32 adapter/unit tests against the saved samples: a repeated poll creates 0 Events, a revised fixture creates a revision; 16 mutations all caught. Live feeds polled with no error.
- `/code-review` gave 9 findings (CR31–CR39): 7 accepted, 1 partly, 1 rejected. Retro: `docs/sessions/S04-ingestion.md`.
