# Prompt 005 — Grill Q3: detection, dedup, updates, notifications

- **Date:** 2026-10-04
- **Phase:** Grilling (`/grill-with-docs`)

## Prompt (verbatim)

```
1. Polling, and the initial value times are fine, configurable from admin panel.
2. Agreed.
3. I think we should refine the updates as well, because the update might have a new impact. Following the given example, a company policy might have a different plan on magnitude <6 and >6.
4. Agreed.
```

## Outcome

- Polling with intervals an admin can configure; dedup on (source, externalId); no backfill; one Notification per channel, delivered async; one notification per (user, event, channel).
- **Human course-correction:** turned down the AI's "first version wins, updates never re-notify" proposal. Real policies have thresholds (e.g. M6) that an upward revision can cross, so updates have to be evaluated again. The AI came back with a refined design (Q3b).
