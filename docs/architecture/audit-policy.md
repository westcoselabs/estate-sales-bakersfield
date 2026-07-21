# Authentication Audit and Telemetry Policy

The PostgreSQL `audit_entries` table is append-only and reserved for meaningful account, session, security, and administrator state changes. Phase 2 repository transactions persist account creation, email verification and known-token rejection, password-reset requests and completion, login success, session creation/rotation/logout/revocation, organizer creation/update, and global session revocation. Later commands must add records for email/role changes, restrictions, administrator actions, TOTP lifecycle changes, and security-sensitive authorization failures when operationally meaningful.

Routine incorrect-password attempts, unknown-account attempts, ordinary rate-limit rejections, and automated credential-stuffing noise do not create one immutable row per attempt. They belong in bounded structured logs, metrics, and rate-limit telemetry, with Sentry/alerts only for anomalous patterns.

All telemetry must:

- use enumeration-safe outcomes;
- omit passwords, raw session/verification/reset tokens, cookies, and authorization headers;
- avoid raw email when it is unnecessary;
- use keyed, privacy-safe fingerprints when correlation is useful;
- be retention-bounded independently of immutable enforcement history.

Audit metadata must remain narrow and must never become a copy of request bodies or private domain records.
