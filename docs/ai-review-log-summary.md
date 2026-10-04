# AI Review Log — Summary

A short version of [ai-review-log.md](ai-review-log.md). IDs match the full log.

## Headline numbers

The log has two kinds of entry: **99 code-review findings (CR1–CR99)** from an independent `/code-review` agent, and **65 reality checks (R1–R65)** where AI output was tested against live feeds, docs, CLIs, mutations or screenshots.

Counting method: by the verdict emoji in the last column. ✏️ ("corrected") covers partly accepted, accepted-as-plausible and deferred findings; only CR23 is an explicit deferral (SSRF, moved to S5 and fixed there, D21(c)).

| Session | CR range | ✅ Accepted | ✏️ Partly / deferred | ❌ Rejected |
|---------|----------|-----------:|--------------------:|-----------:|
| S1 scaffold | CR1–10 | 7 | 1 | 2 |
| S2 domain core | CR11–20 | 7 | 0 | 3 |
| S3 persistence & API | CR21–30 | 7 | 1 (CR23 deferred) | 2 |
| S4 ingestion | CR31–39 | 7 | 1 | 1 |
| S5 delivery | CR40–49 | 7 | 1 | 2 |
| S6 frontend | CR50–59 | 9 | 1 | 0 |
| S7 admin | CR60–69 | 6 | 3 | 1 |
| S8 Webhook | CR70–78 | 9 | 0 | 0 |
| S9 Playwright + full-repo review | CR79–99 | 14 | 1 | 6 |
| **Total** | **99** | **73** | **9** | **17** |

Reality checks: 17 confirmed the AI (✅), 47 corrected it (✏️), 1 rejected it outright (R1).

## Most important catches

| ID | What was wrong | What changed |
|----|----------------|--------------|
| CR92 | The Freshness Window also gated Event Updates, so a GDACS alert turning Red days later notified nobody. | A raised Severity skips the window (D25). |
| CR14 | Escalation compared with the previous version, so M5.9→6.0→5.9→6.0 escalated twice. | Compare with each recipient's highest notified Severity (D18(d)). |
| CR11 | `z.url()` accepted `javascript:` and `data:` URLs (stored XSS). | Only `http(s)` allowed. |
| CR21 | Destination delete was check-then-delete; a concurrent rule save could leave a rule with no destinations. | Join table with `ON DELETE RESTRICT`; the database holds the invariant. |
| CR42 | A title like `<!channel>` in Slack's fallback text would ping a whole channel. | Fallback text escaped like the blocks. |
| CR93 | "Send test" on a Webhook showed the resolved IP of a refused host, so users could map internal DNS. | Message no longer names the address. |
| CR56 | Route ids went into API paths unencoded (`..%2Fadmin` reached admin endpoints with the user's token). | `encodeURIComponent` on every id. |
| CR40 | An interrupted attempt could leave a Notification `pending` with no attempts left and no job. | Marked `failed` so admin retry can reach it. |
| CR70 | A 4xx with a stalled body became a retryable "unreachable". | The status line decides once it arrives. |
| CR50 | Pasting "oil, gas, gold" kept only the last Keyword. | One list built for the whole paste. |
| R3 | GDACS also publishes earthquakes, floods 179 items on first poll, and has unreliable dates. | One source per Category, Freshness Window, content hash (D15). |
| R24 | The AI's own S3 handoff put `kind` in the Notification key, which would silently drop a second Escalation. | Key uses Severity (D19(a)). |

## Notable rejections

- **CR3**: "the API won't boot if the database is down". Tested with Postgres stopped: it boots and answers 503.
- **CR19**: rename `Event` because it shadows the DOM type. "Event" is the glossary term, and misuse is a type error, not a silent bug.
- **CR27**: NULL `destinationId` rows aren't deduplicated. They only exist after a destination is deleted, when nothing can insert for it.
- **CR46**: parallel e2e workers steal each other's jobs. Identical workers deliver the same way; 6 parallel runs showed no flakes. (R50 later found that a *differently configured* process does steal jobs, and noted it.)
- **CR95**: count only `sent` Notifications as "already notified". That would send a second match while the first is still retrying; the right fix needs per-recipient ordering, so it is a next step.
- **CR89**: cache Playwright browsers in CI. Playwright's docs advise against it.

## Recurring patterns in what the AI got wrong

- **Stale tool knowledge.** Versions and APIs written from memory were out of date: Prisma 7 config and `migrate dev` (R7, R26), npm `latest` being an RC (R4), TS 7 (R5), shadcn flags (R8), pnpm 12 build approval (R9, R27), `react-router-dom` (R11). Fixed by checking `npm view`, docs and real CLI runs first.
- **Tests that didn't test.** Mutations survived the AI's own tests (R32, R44, R63), cleanup leaked rows (R33), fakes didn't behave like the real thing (R34). Mutation checks ran in every session from S2 on.
- **Contradicting its own earlier decisions.** The S3 handoff broke D18(d) (R24); the README had four claims written from memory (R64); copy and docs drifted (CR99).
- **Unhappy paths in delivery and state.** Interrupted attempts, stalled bodies, retry limits and remount races (CR40, CR70, CR94, CR60–62).
- **Input that crosses a trust boundary.** URLs, SSRF, mrkdwn escaping and path ids were all caught by review, not written safely the first time (CR11, CR23, CR42, CR56, CR93).
- **Copy-paste across packages.** The same helper or schema written in two or three places (CR29, CR48, CR58, CR68, CR69).
