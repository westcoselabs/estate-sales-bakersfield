# Stripe Webhook and Payment Recovery Runbook

## Safe triage

1. Work only in the intended environment; confirm `APP_ENV`, resource markers, deployment hostname, and Stripe test/live mode without printing credentials.
2. Locate the internal payment attempt by its internal UUID or stored Checkout Session ID. Do not paste a session URL, webhook body, signature, customer data, address, or secret into logs or tickets.
3. Inspect only bounded state: Checkout/payment/fulfillment status, revision, digest correlation, timestamps, failure reason code, webhook event processing state, audit actions, and durable-job state.
4. A `PAID` + `BLOCKED` attempt must not be forced to publish. Correct the underlying approval/ownership/schedule/media issue and use an explicitly reviewed recovery procedure; Phase 4 has no refund or override UI.

## Missing or failed webhook

- Confirm the Preview endpoint is exactly `/api/webhooks/stripe` and subscribed to Checkout completion, async success/failure, and expiry events.
- Stripe replay is safe: the event ID is deduplicated and fulfillment is idempotent.
- A signature failure requires checking the endpoint-specific Preview webhook secret. Never reuse a CLI or Production endpoint secret.
- For a known attempt, run `pnpm payments:reconcile -- --attempt=<internal-uuid>` in a protected environment with the same Preview variables. For discovery, run `pnpm payments:reconcile`, then invoke the authenticated job runner.
- The job runner may retry up to the row's bounded `maxAttempts`; stale processing locks are recovered by the existing runner. A dead job retains sanitized error code/message and requires operator review before a new deliberate enqueue.

## Acceptance evidence

Record environment, attempt UUID, sanitized state before/after, webhook event ID, job ID/status, and canonical path when fulfilled. Never record keys, signatures, payload bodies, URLs containing session identifiers, exact private addresses, or raw exceptions.
