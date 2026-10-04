# Prompt 007 — Grill Q4: users, ownership, auth

- **Date:** 2026-10-04
- **Phase:** Grilling (`/grill-with-docs`)

## Prompt (verbatim)

```
I agree with the recommendation, no need to work on oauth and such.
```

## Outcome

- Single company; each user owns their own Alert Rules and Channel Destinations.
- Email + password + JWT; roles `user` and `admin`; seeded demo accounts; server-side role guards.
- OAuth/SSO, password reset, email verification and multi-tenancy left out on purpose.
