# Notification delivery uses a job queue stored in Postgres (pg-boss), not BullMQ/Redis

Delivering Notifications needs async jobs with retries and backoff. We use pg-boss, which keeps jobs in the Postgres database we already run, instead of the more common BullMQ + Redis. At our scale (a few events per minute) Redis adds an extra service to run and to explain while giving no throughput we need. Jobs and domain data also live in one database, so a Notification and its delivery job can be written in the same transaction.

## Consequences

- No Redis in docker-compose.
- If volume ever grows past what Postgres can queue comfortably, moving to BullMQ is contained to the delivery module.
