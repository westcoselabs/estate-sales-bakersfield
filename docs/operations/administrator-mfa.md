# Administrator two-step verification

Administrator MFA is optional, per the owner's launch decision. Active, email-verified administrators who have not enrolled can use their password-authenticated session. Completing enrollment makes MFA mandatory for that account, and existing sessions are revoked. Sensitive actions always require password confirmation within the last 15 minutes; enrolled accounts also require recent MFA. The **Security** link opens `/account/security` for optional enrollment or fresh MFA proof. Ordinary user sign-in is unchanged.

## Configure and enroll

1. When choosing to enable MFA, configure a dedicated `ADMIN_MFA_ENCRYPTION_KEY` containing 64 hexadecimal characters (32 random bytes) in the target environment. Generate it locally with a cryptographic random generator; keep it in the deployment secret manager. Use a different key for Development and Production. A missing key blocks enrollment/challenges; it does not block administrators who have never enrolled or the public build. Keep the key available for any enrolled account.
2. Back up the key in the operator's secure password manager, separately from database backups. Do not place the key in Git, tickets, logs, screenshots, or public environment variables.
3. After deployment, sign in as the verified administrator. Open `/account/security`, confirm the password, and add the displayed setup key to an authenticator as a time-based code: SHA-1, six digits, 30 seconds.
4. Enter a current code within ten minutes to enable MFA. Save all ten recovery codes in a secure password manager before continuing. The application shows them once, stores only their SHA-256 digests, and never emails them.

The enrollment confirmation rotates the session token and signs out all other sessions. The prior authenticator remains active while a replacement is pending. Successful replacement changes the credential generation and invalidates old sessions and recovery codes. Authenticator codes cannot be reused, including an enrollment code: wait for the next code when another challenge is needed. Up to one adjacent time interval is accepted to accommodate clock drift.

## Recovery and replacement

If the phone is lost, sign in with the password and choose **Use a recovery code**. Each code works once. Then confirm the password under **Replace your authenticator**, complete new enrollment, and store the new recovery codes. **Replace recovery codes** requires recent MFA and the password; all prior recovery codes immediately stop working.

Password reset does not disable MFA. The provisioning script does not reset an existing administrator's MFA.

If every authenticator and recovery code is lost, a trusted operator with database/deployment access must independently verify the account owner, review the incident, and record authorization in the operator's incident record. Then run the dedicated recovery command with the target environment's trusted credentials already loaded:

```text
node --conditions=react-server --import tsx scripts/recover-admin-mfa.ts --user=<administrator-uuid> --environment=<APP_ENV> --resource=<DATABASE_RESOURCE_ENV> --confirm=RESET-ADMIN-MFA:<administrator-uuid>
```

The command verifies the target is the active, verified administrator, records `ADMIN_MFA_OPERATOR_RESET`, deletes that account's MFA credential/recovery codes, and revokes every session in one transaction. It never changes roles or resets passwords. The owner must sign in again; enrollment is then optional under the current policy. This command is operator recovery, not a password-only HTTP bypass.

## Encryption-key rotation or loss

Do not simply overwrite the environment key: existing authenticator secrets are authenticated ciphertext bound to the original key and account ID. An unmatched key makes challenges unavailable. Keep the original key until the intended recovery or migration is complete.

For the current single-administrator app, rotate during a planned maintenance window: confirm operator access and owner identity, back up the database and original key securely, run the operator reset, install the new independently generated key and redeploy, then have the owner sign in and enroll again. After operator reset, password-only administrator access returns; complete enrollment to restore MFA protection. Public browsing continues. If the original key is lost, the same explicit operator recovery and enrollment process is required. Restore the original key only with the matching database state; recovery-code consumption and credential generations must not be rolled back casually.

## Operational checks

Monitor sanitized `ADMIN_MFA_*` audit events and authentication rate-limit failures. No secret, TOTP, recovery code, ciphertext, password, or session token belongs in operational messages. The MFA endpoints use trusted-origin checks, bounded JSON input, database-backed account/network limits, and non-cacheable responses. Codes are consumed and session tokens rotated atomically; credential versions prevent previously issued sessions regaining access after replacement.

The deterministic key in `scripts/start-e2e-server.ts` is restricted to the isolated test application. It is not a Development or Production deployment key.
