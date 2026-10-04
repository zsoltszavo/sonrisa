# Context — World Event Alerts

## Glossary

### Event
A single real-world happening that has been ingested and normalised into one common shape, whatever its origin (e.g. an earthquake, a news headline, a simulated market move).

### Event Source
Where Events come from. Each source turns its own raw data into Events. Examples: the USGS earthquake feed, a news/disaster feed, the Simulated Source.

### Simulated Source
An Event Source whose Events are created on purpose by an Admin (or by seed data) rather than observed in the world. Used for repeatable demos and for categories with no real feed (e.g. markets).

### Category
The kind of Event: `earthquake`, `disaster`, `news`, `market`. Each Event has exactly one Category.

### Severity
How significant an Event is, on one common scale from 1 (minor) to 5 (critical). Each Event Source maps its own measure (e.g. earthquake magnitude) onto this scale.

### Alert Rule
A user's statement of what counts as important to them: a Category, a minimum Severity, optional Keywords, and the Channels to notify on. An Event that satisfies an Alert Rule is a **Match**.

### Keyword
A word or phrase written by the user on an Alert Rule and looked for in an Event's text. Keywords narrow a rule. A rule with no Keywords matches on Category and Severity alone.

### Channel
A way of delivering a Notification to a user: `email`, `slack`, with more to come later.

### Notification
One delivery to one user on one Channel about one Event. It lists every Alert Rule of that user that matched. Status: `pending` → `sent` | `failed`.

### Event Update
A newer version of an Event the source has already sent (same source, same external id, changed content). Every Alert Rule is checked against it again.

### Escalation
A follow-up Notification sent when an Event Update moves the Event's Severity up, to users already notified about that Event. A downgrade never causes an Escalation.

### User
A person who signs in and owns Alert Rules and Channel Destinations. A User has a role: `user` or `admin`.

### Admin
A User with the `admin` role who runs the system (Event Sources, Notifications, Users) rather than mainly owning alerts.

### Channel Destination
A specific address on a Channel, owned by a User, e.g. "my email address" or "the #ops-alerts Slack webhook". An Alert Rule notifies one or more Channel Destinations.

### Slack Stand-in
A local service used during development and demos that receives Slack webhook messages and displays them, in place of the real "sonrisa" Slack workspace that isn't available yet.

### Freshness Window
How old an Event may be and still trigger Notifications. Older Events are stored and visible but never notify. Set per Event Source.
