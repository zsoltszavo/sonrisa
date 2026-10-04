# Prompt 015 — S1 kickoff

- **Date:** 2026-10-04
- **Phase:** Implementation — S1 (Scaffold & infrastructure)

## Prompt (verbatim)

```
Start session S1 (Scaffold & infrastructure) of /Users/zsolt.szavo/Code/design (repo github.com/zsoltszavo/sonrisa). First read CONTEXT.md, the "Rules for every session" and "S1" sections of docs/plan.md, and docs/decision-log.md (D13 is the stack). Save this prompt verbatim as docs/prompts/015-s1-kickoff.md, matching the existing prompt-file format. Then build the pnpm monorepo: apps/web (Vite+React+TS+Tailwind+shadcn/ui+React Router+TanStack Query), apps/api (NestJS + Prisma with a /health endpoint that queries Postgres), packages/shared (TS+zod), docker-compose with Postgres and Mailpit, root typecheck/lint/test scripts, a GitHub Actions CI and .env.example. Check scaffolding CLI versions and flags against their real docs rather than from memory, and log any corrections in docs/ai-review-log.md. Finish with gates passing, an independent /code-review, the docs/sessions/S01-scaffold.md retro, and ask me before committing "Scaffold monorepo, infra and CI gates".
```

(Handed over from the previous session's `NEXT>` line; the human added: "Let's kick off S1.")

## Outcome

- Monorepo scaffolded and wired end-to-end (web → `/api/health` → Postgres); gates green locally, including a CI-style clean run; CI workflow added.
- A subagent checked every scaffolding CLI against real docs and scratch runs. 14 corrections were logged (R4–R17), including plan drift: Nest 12 = ESM + Vitest → D17.
- `/code-review` gave 10 findings (CR1–CR10): 7 accepted, 1 partly accepted, 2 rejected with evidence.
- Retro: `docs/sessions/S01-scaffold.md`. Commit awaits human approval.
