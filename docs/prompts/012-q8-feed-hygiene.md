# Prompt 012 — Grill Q8: real-feed clean-up

- **Date:** 2026-10-04
- **Phase:** Grilling (`/grill-with-docs`)

## Context

Before this question, the AI checked the USGS and GDACS feeds with live `curl` calls (see `docs/ai-review-log.md` R2/R3, samples in `docs/evidence/feed-samples/`). This turned up overlapping earthquakes, a first-poll flood risk and messy timestamps.

## Prompt (verbatim)

```
All the above looks good.
```

## Outcome

- Accepted: GDACS ignores EQ; 6h freshness window (configurable per source); GDACS Green→2 / Orange→4 / Red→5; occurredAt = dateadded and updates detected by content hash; news and markets only from the Simulated Source.
