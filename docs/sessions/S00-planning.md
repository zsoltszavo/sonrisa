# S0 — Planning (retro)

**Goal:** turn the vague brief into an agreed, documented domain and a plan of attack.

**What happened**
- Grilled through Q1–Q9 (prompts 001–013): event sources, Alert Rule shape, keyword rules, pipeline, event updates, ownership/auth, admin scope, channels, Slack without a workspace, stack, feed clean-up, process.
- Wrote the glossary (`CONTEXT.md`), D1–D16, ADR 0001 (re-checking updates) and ADR 0002 (pg-boss).

**Where the AI was wrong or incomplete**
- Proposed "first version wins, never re-notify" for updates. The human turned it down (R1 → ADR 0001).
- Proposed GDACS without knowing it also carries earthquakes, sends a 179-item first poll and has unreliable dates. Caught by checking the live feeds (R3 → D15).
- Read "sonrisa" ambiguously and asked instead of guessing (Q6b).

**Human scope calls:** admin v1 = 4 capabilities only; OR-only keywords; accents normalised; no real delivery in v1; no OAuth.

**Commits:** `d3d9aac` planning; plan commit follows.
