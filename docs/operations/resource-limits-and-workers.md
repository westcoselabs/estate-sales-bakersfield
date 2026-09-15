# Listing resource limits and maintenance workers

## Account admission

The constants in `src/modules/events/domain/resource-policy.ts` define the initial limits:

| Resource                                              | Account limit                       |
| ----------------------------------------------------- | ----------------------------------- |
| Active unpublished drafts                             | 20                                  |
| Retained photos across all events                     | 300                                 |
| Original upload bytes, including pending reservations | 2 GiB                               |
| New drafts                                            | 10/hour                             |
| Photo reservations                                    | 180/minute                          |
| Photo finalizations                                   | 180/minute                          |
| Concurrent photo finalizations                        | 2/account across workers, 1/runtime |

An upload reservation charges its full 15 MiB allowance until the original's actual size is recorded. This is a source-upload budget, not a measurement of derived Blob storage bytes. The retained-photo count also bounds the number of stored renditions. Photos from canceled/deleted events count until their object keys are cleared after purge. A successfully purged photo releases its allowance even when its database history remains.

Draft and photo admissions lock the account's user row before checking counts and inserting data, so parallel requests against different drafts share one budget. Existing ownership, version, publication and per-event photo checks still apply. PostgreSQL rate-limit failures deny new expensive work with a retryable 503; exhausted allowances return 429 and `Retry-After`.

A runtime processing slot is acquired before downloading or consuming an upload. Busy requests keep the upload reservation intact. The slot is released on success or error. On processing admission, the account lock protects a fresh ten-minute reservation lease and atomically moves the pending cleanup job to that expiry plus a one-minute grace period. Starting near the original upload deadline therefore keeps both the distributed slot and staging image available. If cleanup already owns the upload, admission rolls back. The finalize route has a 60-second host duration; a killed worker's distributed slot expires with the renewed lease, after which the cleanup job can recover stale `PROCESSING` photos. Sharp decodes and orients the source once into a bounded 2400-pixel intermediate, then encodes the four renditions sequentially. Cover and gallery variants retain the whole image.

## Photo upload flow

For `APP_ENV=local`, leaving `BLOB_READ_WRITE_TOKEN` blank stores photos in the ignored `.local/media` directory. Files persist across local server restarts. The local adapter signs size-limited uploads using a key derived from `AUTH_FINGERPRINT_SECRET`; files are served through the existing authorized media route after processing. Keep this directory with the local database that references it. These files are not copied to cloud storage automatically. Preview and Production still require their configured private Blob store. Test runs use their separate isolated filesystem adapter.

The browser prepares eligible large JPEG/PNG/WebP files one at a time, with a maximum 2400-pixel edge. It keeps the original if conversion is unsupported or does not save enough bytes. HEIC/HEIF continue through server decoding. Server format validation, metadata removal, ownership checks, and resource budgets still apply.

Three file pipelines overlap preparation, direct storage transfer, and finalization. A file can become ready before the remaining files finish transferring. Version-changing draft saves and photo mutations share a serial queue; upload authorization accepts older versions only for a valid, unconsumed owner-scoped reservation. Temporary pre-consumption busy/rate-limit responses retry finalization with the already-uploaded bytes and honor `Retry-After`. A lost response is reconciled before retry is offered.

Users can review or edit other steps during uploads while keeping the builder page open. Approval waits for pending photos, and creating a new reservation invalidates an earlier approval. The 180-request burst accommodates a 150-photo batch and bounded retries; native processing concurrency and storage allowances remain the same.

## Worker admission and scheduling

Each configured worker invocation admits up to 50 jobs with concurrency two. It claims only an immediately runnable wave, checks a 20-second admission budget before each wave, and stops admitting when less than five seconds remain. Already-started handlers finish normally; they are not canceled midway through provider side effects. Existing stale-lock recovery and idempotency remain necessary if the host terminates an invocation.

The owner selected the existing daily Vercel schedules until upgrading to Pro: maintenance at 09:00 UTC and email at 10:00 UTC. These are scheduled hours; Hobby execution may occur later within the hour. Queued receipts, recovery and cleanup can wait about a day, or longer with backlog/failures. Normal Stripe webhook fulfillment and direct authentication email delivery do not depend on these cron runs. Raising the per-run cap does **not** provide a high-volume continuous worker or a delivery-time guarantee. Revisit cadence when upgrading or when queue arrivals exceed deployed capacity.

For the explicitly configured Development environment:

```powershell
node --conditions=react-server --import tsx scripts/run-jobs.ts --once
node --conditions=react-server --import tsx scripts/run-jobs.ts --continuous
```

The script uses the process environment; load the correct nonproduction environment before starting it. `--once` drains one bounded maintenance batch and one email batch. `--continuous` repeats those batches, waits five seconds between cycles, and stops admitting new cycles on SIGINT/SIGTERM. Run continuous mode under a process supervisor in the eventual chosen worker environment. Do not start it against production without the deployment's approved provider configuration.

## Readiness and alerts

The bearer-protected `/api/internal/readiness` response warns on:

- Dead jobs.
- Failed Resend webhook processing.
- Payments requiring manual review.
- Paid payments with blocked fulfillment.
- Runnable jobs later than `JOB_MAX_QUEUE_DELAY_MINUTES` (default 1,500 minutes / 25 hours for daily schedules), or running jobs with locks older than 15 minutes.

These are signals for a monitor to alert on; the endpoint does not send notifications itself. The daily queue allowance avoids warning on ordinary scheduled waiting while keeping stuck-worker detection separate. It does not increase throughput or guarantee a delivery time. See [monitor setup and incident response](provider-and-recovery-runbook.md#daily-monitoring); reduce the queue allowance when a faster scheduler is adopted.
