CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'RESTRICTED', 'DISABLED');
CREATE TYPE "job_status" AS ENUM ('PENDING', 'RUNNING', 'FAILED', 'SUCCEEDED', 'DEAD');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(320) NOT NULL,
  "normalized_email" VARCHAR(320) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "email_verified_at" TIMESTAMPTZ(3),
  "role" "user_role" NOT NULL DEFAULT 'USER',
  "status" "account_status" NOT NULL DEFAULT 'ACTIVE',
  "restriction_reason" VARCHAR(500),
  "restricted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_restriction_consistency" CHECK (
    ("status" = 'RESTRICTED' AND "restricted_at" IS NOT NULL)
    OR ("status" <> 'RESTRICTED')
  )
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "user_agent" VARCHAR(512),
  "device_label" VARCHAR(100),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verification_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "resend_count" INTEGER NOT NULL DEFAULT 0,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_verification_token_counts" CHECK ("resend_count" >= 0 AND "attempt_count" >= 0)
);

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_token_attempts" CHECK ("attempt_count" >= 0)
);

CREATE TABLE "audit_entries" (
  "id" BIGSERIAL NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(100) NOT NULL,
  "target_type" VARCHAR(100) NOT NULL,
  "target_id" VARCHAR(100),
  "request_id" VARCHAR(100),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "durable_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "queue" VARCHAR(50) NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "job_status" NOT NULL DEFAULT 'PENDING',
  "deduplication_key" VARCHAR(200),
  "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 10,
  "locked_at" TIMESTAMPTZ(3),
  "locked_by" VARCHAR(100),
  "last_error_code" VARCHAR(100),
  "last_error_message" VARCHAR(1000),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "durable_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "durable_job_attempts" CHECK (
    "attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts"
  ),
  CONSTRAINT "durable_job_lock_consistency" CHECK (
    ("status" = 'RUNNING' AND "locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)
    OR ("status" <> 'RUNNING' AND "locked_at" IS NULL AND "locked_by" IS NULL)
  )
);

CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");
CREATE INDEX "email_verification_tokens_user_id_expires_at_idx" ON "email_verification_tokens"("user_id", "expires_at");
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");
CREATE INDEX "audit_entries_actor_user_id_occurred_at_idx" ON "audit_entries"("actor_user_id", "occurred_at");
CREATE INDEX "audit_entries_target_type_target_id_occurred_at_idx" ON "audit_entries"("target_type", "target_id", "occurred_at");
CREATE UNIQUE INDEX "durable_jobs_queue_type_deduplication_key_key" ON "durable_jobs"("queue", "type", "deduplication_key");
CREATE INDEX "durable_jobs_status_run_at_idx" ON "durable_jobs"("status", "run_at");
CREATE INDEX "durable_jobs_locked_at_idx" ON "durable_jobs"("locked_at");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_audit_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_entries are append-only';
END;
$$;

CREATE TRIGGER audit_entries_append_only
BEFORE UPDATE OR DELETE ON "audit_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_entry_mutation();
