ALTER TABLE "sessions"
  ADD COLUMN "mfa_authenticated_at" TIMESTAMPTZ(3),
  ADD COLUMN "mfa_credential_version" INTEGER;

CREATE TABLE "admin_mfa_credentials" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "encrypted_secret" VARCHAR(1024),
  "enabled_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "last_used_step" INTEGER NOT NULL DEFAULT -1,
  "pending_encrypted_secret" VARCHAR(1024),
  "pending_expires_at" TIMESTAMPTZ(3),
  "pending_session_id" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "admin_mfa_active_secret_consistent" CHECK (
    ("enabled_at" IS NULL AND "encrypted_secret" IS NULL) OR
    ("enabled_at" IS NOT NULL AND "encrypted_secret" IS NOT NULL AND "version" > 0)
  )
);
CREATE TABLE "admin_mfa_recovery_codes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "admin_mfa_credentials"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "code_hash" CHAR(64) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  CONSTRAINT "admin_mfa_recovery_codes_user_id_code_hash_key" UNIQUE ("user_id", "code_hash")
);

-- Existing sessions receive NULL MFA state and must complete a challenge.
