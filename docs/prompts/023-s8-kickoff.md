# Prompt 023 — S8 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S8 (Extensibility proof: Webhook channel)

## Prompt (verbatim)

```
Start session S8 (Extensibility proof: Webhook channel) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S7 committed as 83dd33c + bd51225, CI green). First read CONTEXT.md, the "Rules for every session" and "S8" sections of docs/plan.md, docs/decision-log.md (especially D11, D19(e), D21, D22(e), D23), docs/adr/, and the "Notes for later sessions" in docs/sessions/S07-admin-view.md (use DATABASE_URL=postgresql://sonrisa:sonrisa@localhost:5433/sonrisa_s7 for the dev API and sonrisa_s6 for e2e, never the same one; start the dev API with SLACK_STANDIN_URL=http://localhost:4010; the destination form only renders string config fields, so give the Webhook config fields .meta({ title, description, format })). Save this prompt verbatim as docs/prompts/023-s8-kickoff.md in the existing prompt-file format. Then add a Webhook ChannelProvider in apps/api/src/channels in its own commit, registered without any frontend or shared-enum change, with its own SSRF-safe URL rules decided and logged in the decision log, retries/permanent-failure handling consistent with D21, unit tests for its payload and error mapping, an e2e test that delivers to a local receiver, and a reality check showing a Webhook destination created from the generated form, "Send test" working and its Notifications appearing in the admin Notification log (screenshots in docs/evidence/s08/). Finish with gates passing, an independent /code-review logged in docs/ai-review-log.md, and the docs/sessions/S08-webhook-channel.md retro; then commit and push (standing permission) and confirm CI is green.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's kick off S8.")

## Outcome

- `webhook` Channel in its own commit (`9b55c21`). Production code outside the provider: one line each in `ChannelRegistry` and `ChannelsModule`, plus `WEBHOOK_ALLOWED_ORIGINS`. No pipeline, shared or web change was needed for it to work.
- URL rules and checked DNS lookup decided as D24; error mapping consistent with D21.
- 61 unit tests, 10 e2e tests to a local receiver (98 e2e total), 5/5 mutations caught.
- Reality check: the Webhook destination created from the generated form, a private address refused, "Send test" delivered, the Match and Escalation in the admin Notification log (`docs/evidence/s08/`).
- `/code-review` gave 9 findings (CR70–CR78), all accepted. They include the one D11 leak (the Name placeholder branching on `'slack'`), fixed in its own web commit `2e07d05`. Retro: `docs/sessions/S08-webhook-channel.md`.
