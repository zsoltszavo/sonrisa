# Prompt 017 — S2 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S2 (Domain core)

## Prompt (verbatim)

```
Start session S2 (Domain core, packages/shared) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S1 scaffold is committed as 0c00658 with CI green). First read CONTEXT.md, the "Rules for every session" and "S2" sections of docs/plan.md, docs/decision-log.md (especially D3, D4, D7, D15, D17), docs/adr/, and docs/sessions/S01-scaffold.md "Notes for later sessions". Two small doc edits from S1 are uncommitted (docs/sessions/S01-scaffold.md and docs/prompts/016-s1-commit-approval.md, recording the green CI run); include them in the S2 commit. Save this prompt verbatim as docs/prompts/017-s2-kickoff.md in the existing prompt-file format. Then implement the pure domain core in packages/shared with zod schemas and Vitest tests: Event/Category/Severity types, matches(rule, event) with D4 keyword semantics (title+summary+location, case-insensitive, whole word/phrase, OR, accent-normalised, empty = no filter), per-source severity mapping (USGS magnitude edges on integers; GDACS Green→2, Orange→4, Red→5), and the ADR 0001 escalation decision (upward bucket change only). Check edge cases against the saved feed samples in docs/evidence/feed-samples/. Finish with gates passing, an independent /code-review logged in docs/ai-review-log.md, the docs/sessions/S02-domain-core.md retro, and ask me before committing.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's kick off S2.")

## Outcome

- Domain core built in `packages/shared` (schemas, Severity mapping, Keyword matching, `decideNotifications`, `isFresh`); 108 tests incl. fast-check properties and checks against the saved feed samples; gates green.
- Property and sample tests caught three AI design errors (R18–R20); two more AI slips were caught by `git status` and typecheck (R21–R22). Decisions recorded as D18.
- `/code-review` gave 10 findings (CR11–CR20): 7 accepted, 3 rejected with reasons. CR14 changed the `decideNotifications` input from `previous` to each recipient's highest notified Severity.
- Retro: `docs/sessions/S02-domain-core.md`. Commit awaits human approval.
