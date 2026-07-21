# ADR 005: Resend for Authentication Email

Status: accepted for initial scope.

## Decision

Use Resend as the only initial transactional email provider behind the application-owned `EmailService` port. Phase 2 sends email verification, verification resend, and password-reset messages. Future publication confirmations and enforcement notices use the same port and the durable work mechanism when their owning phases are implemented.

The infrastructure adapter accepts application message types and maps provider results to a provider-message ID or typed delivery error. Resend SDK types do not cross the infrastructure boundary. Local/test environments use a `.tmp` capture adapter and are structurally prevented from selecting Resend; no alternate production provider adapter is built.

## Rationale

This follows the frozen roadmap, keeps launch configuration and expected cost small, and preserves provider portability without building unused infrastructure. Application-owned links, persisted token state, delivery status, idempotency keys, and rate-limited retries keep provider failure recoverable.

## Consequences

Preview and Production require separate Resend credentials and approved sender identities. Missing credentials fail closed; they are never replaced by real sends from automated tests. A verified sending domain and controlled Preview recipient remain external prerequisites.
