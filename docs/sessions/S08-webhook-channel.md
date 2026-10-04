# S8 — Extensibility proof: Webhook channel (retro)

**Goal:** prove D11 for real. Add a `WebhookChannelProvider` (POST JSON to any URL) in its own commit, without touching the pipeline or the frontend, and write down what the diff touched. **Done when:** a user can add a Webhook destination through the generated form and receive events; the diff stat is in this retro.

## What was built

- `apps/api/src/channels/webhook.channel.ts`: the `webhook` Channel (D24).
  - Config `{ webhookUrl }`, with `.meta({ title: 'Endpoint URL', description })`, so the generated form renders it with no web change.
  - Body: `type` (`notification` | `test`), the Notification `id` (also sent as `Idempotency-Key`, since delivery is at-least-once), `kind`, `text`, the reported `severity`/`previousSeverity`, `ruleCount`, the `event` and `destination.label`. The exact receiver output is in `docs/evidence/s08/receiver-payloads.json`.
  - **URL rules** (save and every send): https only, no credentials, no `localhost`/single-label names, IP literals must be public. At send time a **checked DNS lookup** refuses a name if any resolved address is special-purpose, and the socket connects to the address it approved, so DNS rebinding can't get between the check and the connection. Redirects are not followed.
  - **Errors (D21):** 408/429/5xx retry with `Retry-After`; other 4xx, 3xx, blocked addresses and `ENOTFOUND` fail at once; refused connections, `EAI_AGAIN` and the timeout retry.
- `WEBHOOK_ALLOWED_ORIGINS`: exact origins exempt from the rules, for a local receiver (empty by default).
- `apps/api/test/webhook-receiver.ts`: a receiver used by e2e (port 4013) that also runs on its own for dev demos (4012, `GET /received`).
- Tests: 61 unit tests in `webhook.channel.spec.ts` (payload contract, URL rules, blocklist, checked lookup, real-HTTP error mapping, stalled bodies, body cap); `webhook.e2e-spec.ts` with 10 tests (listed by `GET /channels`, 5 SSRF refusals on save, match + Escalation through the real pipeline with the id and `Idempotency-Key`, the admin log showing `webhook`, a 503 retry, a 404 failing at once, "send test").

## The diff stat (the extensibility proof)

Provider commit `9b55c21` "Add Webhook channel (extensibility proof)":

```
 .env.example                                  |   4 +
 apps/api/src/channels/channel-registry.ts     |   5 +-
 apps/api/src/channels/channels.module.ts      |   3 +-
 apps/api/src/channels/webhook.channel.spec.ts | 347 ++++++++++++++++++++++++++
 apps/api/src/channels/webhook.channel.ts      | 303 ++++++++++++++++++++++
 apps/api/src/config/env.ts                    |  15 ++
 apps/api/test/delivery.e2e-spec.ts            |  19 +-
 apps/api/test/support.ts                      |  17 ++
 apps/api/test/webhook-receiver.ts             |  89 +++++++
 apps/api/test/webhook.e2e-spec.ts             | 265 ++++++++++++++++++++
 apps/api/vitest.config.e2e.ts                 |   2 +
 docs/decision-log.md                          |   1 +
 12 files changed, 1050 insertions(+), 20 deletions(-)
```

**Production code outside the new provider: one line in `ChannelRegistry`'s constructor and one in `ChannelsModule`.** The pipeline (`delivery/`), `packages/shared` and `apps/web` were not touched. The rest is config (the new env var, needed because a user-chosen URL needs a dev/e2e exemption Slack never needed), tests (`waitFor` moved to `support.ts`; the `GET /channels` assertion now lists three Channels) and the decision log.

**Leaks found and how they were handled:**
1. **The Name placeholder branched on `'slack'`** (CR72): a Webhook got "My work email". Fixed in its own commit `2e07d05`, with the copy that listed "email or Slack" reworded as examples. This was the only place the web app branched on a Channel key.
2. **The destination list summary is keyed by field name**: `describeConfig` shows the host of any `webhookUrl` field. The Webhook reuses that name (D24(a)) instead of changing the web app. This is a convention the abstraction relies on, not a leak that needed fixing. A Channel with a differently named URL field would get an empty summary, never its full (possibly secret) URL.
3. **Icon:** the Webhook gets the destination list's fallback icon (a paper plane, screenshot 03). Acceptable as is.
4. The admin Notification log needed nothing: the Channel is a plain string (as S7 predicted).

## Deviations from the plan / handoff

- The dev API ran with `INGESTION_SCHEDULER=off`, because the reality check only needed simulated Events.
- Rule creation and the simulated Event were driven through the API in the reality check (the S6/S7 reality checks already cover those screens). Destination creation, the SSRF refusal and "Send test" went through the real form.
- The e2e receiver is in-process (`startWebhookReceiver`), not a spawned service like the Slack Stand-in, because there is no third-party contract to mimic.

## What the AI got wrong

- `BlockList` with an explicit `::ffff:0:0/96` rule blocked every IPv4 address (R59). Caught by the unit tests, then probed in Node directly.
- From `/code-review` (CR70–CR78): the stalled-body race, an e2e port that clashed with the dev port it had just documented, Retry-After only on 429, `ENOTFOUND` retried, missing IANA ranges, a copied helper, a redundant `format`, a per-chunk cap that wasn't, and the placeholder leak.

## Independent review

`/code-review` (high) on the provider commit: 9 findings, CR70–CR78, **all accepted** (CR78's U+FFFD sub-point accepted as harmless). The fixes are in `f590fe0` (API) and `2e07d05` (web).

## Reality checks

- Dev API on `sonrisa_s7` (`SLACK_STANDIN_URL=http://localhost:4010`, `WEBHOOK_ALLOWED_ORIGINS=http://localhost:4012`), Vite, and `node apps/api/test/webhook-receiver.ts 4012`. Headless Chrome over CDP, clicking the real form (R60).
- Screenshots in `docs/evidence/s08/`:
  - `01` the generated Webhook form ("Endpoint URL" plus its description, from `GET /channels`)
  - `02` `https://169.254.169.254/…` refused on the field
  - `03` the destination listed as "Webhook · localhost:4012" with "Test message sent"
  - `04` the admin Notification log with the Match (3) and the Escalation (4) "via Ops webhook (webhook)"
  - `05` the Event detail with its Notifications
- `receiver-payloads.json`: the test body, the Match and the Escalation exactly as received.
- Mutations: 5/5 caught on the first commit (R61), and the CR70 fix's test fails on the old handler.

## AI-shortcut checklist

- [x] Role/auth on the server: no new routes. Destinations stay owner-scoped (existing e2e), and the URL rules run on the server on save and before every send.
- [x] No `any` and no `@ts-ignore`. The only `as` uses are `as const` (literal tuples and payload `type`s). A `server.address() as AddressInfo` was replaced by a checked `portOf()` before it landed.
- [x] No swallowed errors: every transport error maps to a `DeliveryError` with its message. A broken error body only loses detail, and the code says so.
- [x] Tests check behaviour against a real HTTP server and the real pipeline. The mutations failed tests.
- [x] External facts checked: `BlockList` mapping semantics probed in Node 24 (R59); `http.request`'s `lookup` option is called with `all: true` under autoSelectFamily, which the lookup handles both ways (tested); the IANA ranges checked against the registry (CR75); RFC 9110 for `Retry-After` on 503.
- [x] No invented APIs: `BlockList.addSubnet/check`, `net.LookupFunction`, `AbortSignal.any/timeout` and `Buffer.subarray` all run in tests.
- [x] Glossary: Channel, Channel Destination, Notification, Escalation, Event, Severity in code, payload and UI.

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
packages/shared test:       Tests  123 passed (123)
apps/slack-standin test:       Tests  22 passed (22)
apps/api test:       Tests  128 passed (128)
apps/web test:       Tests  52 passed (52)
$ pnpm test:e2e (DATABASE_URL=…/sonrisa_s6)
 Test Files  8 passed (8)
      Tests  98 passed (98)
```

## Notes for later sessions

- **Databases:** unchanged. `sonrisa_s7` = dev/demo (now also has Alice's "Ops webhook" destination, a `disaster ≥ 3 · Danube` rule on it, and the Danube flood Event); `sonrisa_s6` = e2e.
- **Webhook in dev:** start `node apps/api/test/webhook-receiver.ts 4012` and the API with `WEBHOOK_ALLOWED_ORIGINS=http://localhost:4012`. Otherwise Alice's "Ops webhook" fails at send time (the URL rules refuse `http://localhost`). Worth a line in the S9 README demo script, next to the Slack Stand-in one.
- **S9 / next steps:** HMAC signing with a per-destination secret (needs a write-only form field the generated form can't express yet); optionally a per-Channel icon in `ChannelInfo`; an "allow private targets" deployment switch if someone needs an internal receiver.

## CI

Commit `4aa34f3` (with `9b55c21`, `f590fe0`, `2e07d05`): GitHub Actions run [37225246843](https://github.com/zsoltszavo/sonrisa/actions/runs/37225246843), job "typecheck · lint · test · build": **success**.
