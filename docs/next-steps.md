# Next Steps (deliberately out of v1)

Things we considered and chose to leave out of the first version. Each one links to the decision that cut it.

## Event data
- **Real market data feed.** Free APIs need keys and rate-limit hard; markets are covered by the Simulated Source for now. (D2)
- **Geographic filtering** on Alert Rules (region / radius around a point). (D3)
- **LLM-assisted importance** — classifying Events or matching natural-language rules. (D3)
- **AND / "must contain all" keyword mode.** v1 is OR only. (D4)

## Identity & ownership
- **Team- or company-owned Alert Rules** and a team model. (D8)
- **Multi-tenancy** (many isolated organisations). (D8)
- **OAuth / SSO, password reset, email verification.** (D9)

## Admin
- **User management:** list users, promote/demote admin, disable accounts, read-only view of a user's rules. (D10)
- **Overview dashboard:** events per hour by source, sent vs failed notifications, source health. (D10)
- **Editing channel infrastructure in the UI** (SMTP host, Slack credentials) — stays in env/config. (D10)
- **Audit log** of admin actions. (D10)

## Delivery
- **Real email delivery** through a hosted provider (SMTP/Resend etc.). v1 sends to Mailpit only. (D11)
- **Slack app/bot** with direct messages to users (needs an OAuth install). v1 uses Incoming Webhooks. (D11)

## Event data (added after the feed check)
- **A real news source with a defensible severity signal.** Plain RSS has none; v1 covers news through the Simulated Source. (D15)
- **Matching the same real-world event across sources** (e.g. USGS + GDACS earthquakes) instead of one authoritative source per Category. (D15)

## Auth hardening (added in S3)
- **Rate limiting on `/auth/login` and `/auth/register`** (e.g. `@nestjs/throttler`). v1 has none. (D19(g))
- **Non-revealing registration** (always 202 + an email) so account existence can't be probed; it needs email verification, which D9 cut. (D19(g))
- **Refresh tokens / revocation list.** v1 tokens live 12 h; a deleted or demoted user is still cut off immediately because the guard re-reads the User. (D19(d))

## Product polish (added in S7–S9)
- **Pagination** for the admin Events explorer, the Notification log and *My notifications*; v1 shows the newest entries up to a limit. (S7)
- **Server-sent events** instead of the 2 s polling in the admin console, if it ever needs to scale. (S7)
- **Route-level code splitting** in the web app (Vite warns about the bundle size). (S7)

## Webhook channel (added in S8)
- **HMAC signing** with a per-destination secret; needs a write-only field the generated form can't express yet. (D24)
- **A per-Channel icon** in `ChannelInfo`, so a new Channel doesn't get the fallback icon. (S8)
- **An "allow private targets" deployment switch** for teams whose receiver is on an internal network. (D24)

## Delivery edge cases (added in S9)
- **Escalate only recipients whose earlier Notification was delivered.** Today any earlier Notification counts, so a recipient whose match failed for good, or is still waiting for a retry, can get an Escalation for an Event they never saw, possibly before the match. (CR95)
- **Rate-limit "Send test"**, and say less about why a Webhook host is refused: the message no longer shows the resolved address (CR93), but "not public" vs "host not found" still tells a user an internal name exists.
