# Prompt 018 — S3 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S3 (Persistence, auth, user-facing API)

## Prompt (verbatim)

```
Start session S3 (Persistence, auth, user-facing API) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa; S2 domain core committed as 1747ff9 + fix 896f6ad, CI green). First read CONTEXT.md, the "Rules for every session" and "S3" sections of docs/plan.md, docs/decision-log.md (especially D6, D8, D9, D11, D17, D18), docs/adr/, and the "Notes for later sessions" in docs/sessions/S01-scaffold.md and docs/sessions/S02-domain-core.md. In particular, Notification must store the Severity it reported, it is unique per (user, event, destination, kind), and rule create/update must check that every destinationId belongs to the user (CR15). Save this prompt verbatim as docs/prompts/018-s3-kickoff.md in the existing prompt-file format. Then add the Prisma models, seed, argon2 + JWT auth with RolesGuard, and the /me, /destinations and /rules REST endpoints validated with the shared zod schemas from @sonrisa/shared, plus e2e tests proving user A can't read or modify user B's rules or destinations and a non-admin gets 403 on /admin/*. Finish with gates passing, an independent /code-review logged in docs/ai-review-log.md, and the docs/sessions/S03-persistence-auth-api.md retro; then commit and push (standing permission) and confirm CI is green.
```

(Handed over from the previous session's `NEXT>` line; the human added: "Lets kick off S3.")

## Outcome

- Prisma models + one migration, idempotent seed (`@demo.test` accounts), argon2id + HS256 JWT with a default-deny `AuthGuard` and `RolesGuard`, `/me`, `/destinations`, `/rules`, `/admin/event-sources`; shared zod schemas for auth and destination input.
- 38 e2e tests against real Postgres prove the IDOR, CR15 and 403 rules; mutation checks confirm they fail when ownership or role checks are removed (R30).
- Deviation from this prompt: Notification uniqueness is (user, event, destination, **Severity**), not (…, kind), because D18(d) allows repeat Escalations (R24, D19(a)).
- `/code-review` gave 10 findings (CR21–CR30): 7 accepted, 1 deferred to S5, 2 rejected. Retro: `docs/sessions/S03-persistence-auth-api.md`.
