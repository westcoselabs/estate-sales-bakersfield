# Neon compute usage audit

The production database is small, but two staggered background schedules keep it awake continuously. Reducing and aligning those schedules is the first cost reduction. Neon/PostgreSQL remains appropriate for accounts, payments, listings, and geospatial search. The evidence does not justify upgrading for CPU or storage capacity.

## Production evidence on October 14 2026

Read-only database inspection and Vercel production request records established:

| Observation                              | Result                                                 |
| ---------------------------------------- | ------------------------------------------------------ |
| User-supplied warning                    | 80.1 of 100 monthly CU-hours consumed                  |
| Database size                            | 23,003,136 bytes, approximately 23 MB                  |
| Exact row counts                         | 4 users, 7 events, 5 publications, 0 external listings |
| Background queue                         | 398 succeeded jobs; 0 unfinished jobs                  |
| Last completed background job            | October 6 at 9:35 p.m. Pacific                         |
| PostgreSQL process started               | September 15 at 5:09 p.m. Pacific                      |
| Observed production commit               | `b2f77bea814b9b0504a1cfbbb6e1a5f0aa70c092`             |
| Maintenance schedule                     | `*/5 * * * *`                                          |
| Email schedule                           | `2-57/5 * * * *`                                       |
| Last 24 hours of maintenance requests    | 288, all HTTP 200                                      |
| Last 24 hours of email worker requests   | 288, all HTTP 200                                      |
| Total production requests in that window | 814, including 576 cron requests                       |

The request window was October 13 at 9:20 a.m. through October 14 at 9:20 a.m. Pacific. Pagination reported no remaining records or excluded intervals. The live Vercel project and deployment reported the repository's schedules. Git history attributes the five-minute schedules to launch commit `00c482a` on September 15.

Database inspection ran in read-only transactions, selected aggregate counts and operational statistics, and did not modify records or reset statistics. `pg_stat_statements` is not installed, so individual SQL statements cannot be assigned historical CU-hour shares. The Neon billing dashboard, full compute-size history, and other branch usage were not available through connected tools. The warning's 80.1 CU-hours is a supplied snapshot, not a newly fetched billing reading.

## Why low CPU still uses the allowance

Neon meters compute size multiplied by active time. At the screenshot's minimum of 0.25 CU, continuous operation uses `0.25 × 24 = 6 CU-hours/day`, or 186 CU-hours in a 31-day month. That exhausts 100 CU-hours in about 16.7 days even with little useful work. The warning's 80.1 CU-hours equals about 13.35 days at that minimum size, closely matching the timing here. These calculations assume 0.25 CU throughout; scaling and other branches add usage.

Neon suspends an idle Free-plan compute after five minutes. The workers create activity at minutes 0, 2, 5, 7, and so on, leaving gaps of only two or three minutes. Empty queues still execute queries: maintenance cleans rate-limit buckets, checks payment reconciliation candidates, recovers locks, and claims jobs; the email runner also recovers locks and checks its queue. Actual cron logs and the long-running PostgreSQL process support this cause.

The screenshot's maximum 2 CU is a scaling ceiling, not evidence of continuous 2 CU consumption. Lowering that ceiling alone cannot fix the minimum-size, always-awake baseline.

Sources: [Neon plan and compute-hour documentation](https://neon.com/docs/introduction/plans), [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero).

## Cost reduction options

These baselines assume both workers start in the same minute, complete quickly, and the compute suspends five minutes later. They exclude visitors, crawlers, development, other branches, startup overhead, and scale-up.

| Schedule for both queues       | Combined worker requests per day | Approximate cron-only CU-hours per 31 days |
| ------------------------------ | -------------------------------- | ------------------------------------------ |
| Current staggered five minutes | 576                              | 186                                        |
| Together every 15 minutes      | 192                              | 62                                         |
| Together every 30 minutes      | 96                               | 31                                         |
| Together every hour            | 48                               | 15.5                                       |

The selected change uses `*/30 * * * *` for both queues, reducing polling requests by 83% and the modeled cron-only compute baseline by about 83%. Set Production `JOB_MAX_QUEUE_DELAY_MINUTES=60` with deployment. Verification/reset emails and normal Stripe webhook fulfillment already run directly. Background receipts, campaigns, synchronization, payment recovery, and cleanup can wait approximately 30 minutes before the next attempt. Backlogs and retries can take longer. Existing job limits imply at most 100 admitted jobs per queue per hour, with actual throughput constrained by the time budget.

A rough replay of the last day's request timestamps assigned five awake minutes to 55 successful non-cron requests on likely database-reading paths and merged overlaps with the proposed schedule. It estimated approximately 58 CU-hours per 31 days for the half-hourly option. This is a scenario, not a bill forecast: route classification is approximate, one day is a small sample, and branch usage and scale-up are excluded.

## Additional contributors and priorities

1. Public search reads `public_search_revision` from PostgreSQL on every cache lookup. Its 30-second result cache reduces query work but cannot eliminate wakeups. Home and directory pages are dynamic, so crawlers reach these paths too. A later cache redesign should invalidate on writes and preserve moderation removals, address-release times, and sale/date boundaries; simply extending the TTL would weaken those guarantees.
2. Local development uses a separate Neon endpoint. Verify whether it shares this project's allowance and let it sleep when unused. Avoid running the development worker's five-second continuous loop unless needed. No running loop was established by this audit.
3. `/api/health` does not access the database. The checked-in operational monitor runs once daily; protected readiness does query the database. There is no evidence that the daily monitor explains continuous activity.
4. Keep minimum compute at 0.25 CU. Consider a lower maximum only after checking peak memory and connections; it is secondary to eliminating continuous polling.

Relevant code: [cron schedules](../../vercel.json), [maintenance runner](../../src/platform/jobs/configured-runner.ts), [email runner](../../src/modules/email/infrastructure/configured-email-jobs.ts), [queue SQL](../../src/modules/jobs/infrastructure/prisma-job-repository.ts), [search revision lookup](../../src/modules/public-search/infrastructure/next-public-search-cache.ts), [search cache correctness rules](../../src/modules/public-search/application/cached-public-search-service.ts).

## Remaining monthly allowance and rollout

At the supplied warning, 19.9 CU-hours remained. At the minimum-size continuous rate, that is only about 3.3 days of runway. A lower future monthly rate does not refund the 80.1 already consumed. For example, 17 more days at the rough half-hourly scenario's 1.88 CU-hours/day would still exceed the remaining allowance. Staying free this period therefore depends on the actual reset date, live usage, traffic, and further reductions; it cannot be promised from this audit.

On the Free plan, exhaustion suspends compute until the next billing period or an upgrade. Check the actual reset date and remaining balance in Neon before assuming the schedule change alone will bridge this month. Source: [Neon plan limits](https://neon.com/docs/introduction/plans).

The owner accepted the half-hourly schedule on October 14. Rollout requires the 60-minute queue-warning setting and deployment of the new cron definitions. Confirm both live Vercel schedules, check health and readiness, and inspect subsequent hours for inactive gaps and successful processing. Compare the compute usage delta over a full day. Revisit cadence if receipts or cleanup backlog exceed the accepted delay. The initial audit was read-only; the selected remedy changes worker scheduling without changing the Neon plan or database records.
