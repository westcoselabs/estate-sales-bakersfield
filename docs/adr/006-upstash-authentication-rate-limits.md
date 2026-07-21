# ADR 006: Upstash Redis Authentication Rate Limits

Status: accepted for Phase 2.

## Decision

Use Upstash Redis as the distributed authority for authentication rate limits in Preview, staging, and Production. The application port receives only route namespace, HMAC-fingerprinted identifier, limit, and window. The adapter prefixes every key with the validated application environment and executes an atomic fixed-window increment with a bounded expiration.

Limits apply independently to network and subject fingerprints:

| Workflow            |     Network limit |     Subject limit |
| ------------------- | ----------------: | ----------------: |
| Registration        |  5 per 15 minutes |        3 per hour |
| Login               | 20 per 15 minutes | 10 per 15 minutes |
| Verification resend |       10 per hour |        3 per hour |
| Forgot password     |       10 per hour |        3 per hour |
| Password reset      | 10 per 15 minutes |  5 per 15 minutes |

The test-only deterministic adapter is permitted only when `APP_ENV=test`. Provider failure fails closed. Routine rejections produce bounded telemetry rather than immutable audit rows.

## Rationale

The frozen roadmap lists environment-isolated Upstash credentials, and a serverless Redis authority works across Vercel instances without adding an authentication table or cleanup job to PostgreSQL. The fixed-window policy is intentionally simple and deterministic for the initial product.

## Consequences

Fixed windows can permit bursts at boundaries; revisit only with measured abuse. Preview and Production require separate Redis databases and HMAC secrets. Live persistence and expiry verification cannot pass until an isolated Preview resource is configured.
