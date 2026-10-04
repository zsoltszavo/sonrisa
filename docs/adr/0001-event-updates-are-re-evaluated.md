# Event updates are evaluated again, with severity-bucket escalation

When a source revises an Event it has already sent us (e.g. USGS changes M5.8 to M6.1), we store the new version and check every Alert Rule against it again. A new (user, event, channel) match notifies as normal. If the Severity bucket goes **up**, users already notified about that Event get one "Escalated" follow-up. Downgrades and text-only edits are stored but don't notify. The AI first proposed "first version wins, never re-notify", which is simpler. The human turned it down because real policies have thresholds (e.g. M6) that an upward revision can cross.

## Consequences

- Severity edges for each source must line up with the thresholds people actually use. USGS uses integer magnitude edges: <4→1, 4–4.9→2, 5–5.9→3, 6–6.9→4, ≥7→5.
- Events need a version/`updatedAt` and a history of severity changes. Notifications need a kind (`match` | `escalation`).
- Changes *within* a bucket (5.8 → 5.9) are deliberately silent.
