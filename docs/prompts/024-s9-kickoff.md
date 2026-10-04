# Prompt 024 — S9 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S9 (End-to-end, hardening, submission)

## Prompt (verbatim)

```
Start session S9 (End-to-end, hardening, submission) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S8 committed as 9b55c21 + f590fe0 + 2e07d05 + 4aa34f3 + 547a640, CI green). First read CONTEXT.md, the "Rules for every session" and "S9" sections of docs/plan.md, docs/decision-log.md (especially D9, D12, D21, D24), docs/adr/, docs/next-steps.md, and the "Notes for later sessions" in docs/sessions/S07-admin-view.md and docs/sessions/S08-webhook-channel.md (dev API on DATABASE_URL=postgresql://sonrisa:sonrisa@localhost:5433/sonrisa_s7 with SLACK_STANDIN_URL=http://localhost:4010 and WEBHOOK_ALLOWED_ORIGINS=http://localhost:4012 plus node apps/api/test/webhook-receiver.ts 4012; e2e on sonrisa_s6, never the same DB). Save this prompt verbatim as docs/prompts/024-s9-kickoff.md in the existing prompt-file format. Then add a Playwright end-to-end test (login as alice → create a rule → admin simulates an Event → the Notification appears, checked through the Mailpit and Slack Stand-in APIs), run a final full-repo /code-review plus the AI-shortcut checklist, and write the README (what was built, one-command run, a demo script including the Slack Stand-in and Webhook receiver env lines, how to read the process docs, known limitations linking docs/next-steps.md), with screenshots in docs/evidence/s09/. Finish with gates passing, review findings logged in docs/ai-review-log.md, and the docs/sessions/S09-submission.md retro; then commit and push (standing permission) and confirm CI is green.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's finish with S9!")

## Outcome

_(filled in at the end of the session)_
