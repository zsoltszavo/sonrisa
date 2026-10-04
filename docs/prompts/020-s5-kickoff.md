# Prompt 020 — S5 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S5 (Matching & delivery)

## Prompt (verbatim)

```
Start session S5 (Matching & delivery) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S4 committed as 129c2ea + 604c121, CI green). First read CONTEXT.md, the "Rules for every session" and "S5" sections of docs/plan.md, docs/decision-log.md (especially D6, D11, D12, D18, D19, D20), docs/adr/, and the "Notes for later sessions" in docs/sessions/S03-persistence-auth-api.md and docs/sessions/S04-ingestion.md (EventIngestedBus handlers get the Prisma transaction client; CR23 SSRF check at send time). Save this prompt verbatim as docs/prompts/020-s5-kickoff.md in the existing prompt-file format. Then subscribe to EventIngested: isFresh with the source's freshnessHours, then decideNotifications with alreadyNotified = the highest notified Severity per (userId, destinationId), and insert Notifications plus pg-boss jobs in the same transaction (ADR 0002). Grow apps/api/src/channels/channel-configs.ts into a ChannelProvider registry with Email (Nodemailer → Mailpit) and Slack (Incoming Webhook, Block Kit). Add the Slack Stand-in service to docker-compose, with retries (3 attempts, exponential backoff, 429 Retry-After), an admin retry endpoint, GET /channels with JSON Schema and "send test". Finish with gates passing, Mailpit and Stand-in screenshots in docs/evidence/, an independent /code-review logged in docs/ai-review-log.md, and the docs/sessions/S05-matching-delivery.md retro; then commit and push (standing permission) and confirm CI is green.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's kick off S5.")

## Outcome

- `EventIngested` → Freshness Window → `decideNotifications` → Notifications + pg-boss jobs in the Event's transaction (ADR 0002), proven by an e2e rollback test.
- `ChannelProvider` registry with Email (Nodemailer → Mailpit) and Slack (Incoming Webhook, Block Kit, contract test from Slack's docs); exact-host SSRF guard on save and at send (CR23).
- Slack Stand-in (`apps/slack-standin`) in docker compose; 3 attempts with exponential backoff and 429 `Retry-After`, scheduled by the app (D21); admin retry; `GET /channels` with JSON Schema; "send test".
- Reality check with screenshots in `docs/evidence/s05/`; 7 mutations caught; `/code-review` gave 10 findings (CR40–CR49): 7 accepted, 1 partly, 2 rejected. Retro: `docs/sessions/S05-matching-delivery.md`.
