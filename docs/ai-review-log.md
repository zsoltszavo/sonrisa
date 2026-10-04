# AI Review Log

Every place we checked AI output against reality, instead of trusting that it looks right. Verdicts: ✅ accepted · ✏️ corrected · ❌ rejected.

| # | Date | What the AI proposed / produced | Check we ran | Verdict & finding |
|---|------|--------------------------------|--------------|-------------------|
| R1 | 2026-10-04 | "First version wins, updates never re-notify" (Q3) | Human checked it against a realistic policy (M<6 vs M≥6) | ❌ Rejected by the human → ADR 0001 |
| R2 | 2026-10-04 | USGS GeoJSON summary feed with fields `mag`, `place`, `time`, `updated`, `id` (Q1) | `curl` on the live feed; sample saved to `evidence/feed-samples/` | ✅ Endpoint and fields exist as claimed. `updated` confirms revisions happen (supports ADR 0001) |
| R3 | 2026-10-04 | GDACS RSS as the disaster feed, with alert level Green/Orange/Red (Q1/Q8) | `curl` + grep over the live feed; sample saved | ✏️ The feed is real, but three things the AI hadn't planned for: (1) GDACS **also publishes earthquakes (EQ)** → the same quake would arrive from two sources; (2) **179 items on the first poll, ~80% Green wildfires** → a flood of alerts on the first poll; (3) messy dates (`fromdate` in the future, `datemodified` < `dateadded`). Led to Q8 |
