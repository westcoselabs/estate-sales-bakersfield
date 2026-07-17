# ADR 003: Minimal PostgreSQL Durable Jobs

Status: accepted for the foundation.

## Decision

Use a PostgreSQL `durable_jobs` table and small repository/runner rather than adding a queue provider. Enqueue supports optional deduplication. Claiming uses `FOR UPDATE SKIP LOCKED`, bounded batches, worker locks, attempts, exponential backoff with jitter, terminal dead state, and stale-lock recovery.

This is the durable work/outbox foundation needed by later email, media, webhook, cleanup, and reconciliation work. It is not a generic job-administration product, retry dashboard, final alerting system, or complete reconciliation interface. Those evolve with the features that require them.
