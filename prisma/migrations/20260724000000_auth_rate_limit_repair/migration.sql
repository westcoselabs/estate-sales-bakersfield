CREATE TABLE IF NOT EXISTS "authentication_rate_limit_buckets" (
  "environment" VARCHAR(16) NOT NULL,
  "scope_hash" CHAR(64) NOT NULL,
  "namespace" VARCHAR(64) NOT NULL,
  "identifier_hash" CHAR(64) NOT NULL,
  "attempt_count" INTEGER NOT NULL,
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "authentication_rate_limit_buckets_pkey" PRIMARY KEY (
    "environment",
    "scope_hash",
    "namespace",
    "identifier_hash"
  ),
  CONSTRAINT "authentication_rate_limit_environment" CHECK (
    "environment" IN ('local', 'test', 'preview', 'production')
  ),
  CONSTRAINT "authentication_rate_limit_scope_hash" CHECK (
    "scope_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "authentication_rate_limit_namespace" CHECK (
    "namespace" ~ '^[a-z][a-z0-9:_-]{0,63}$'
  ),
  CONSTRAINT "authentication_rate_limit_identifier_hash" CHECK (
    "identifier_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "authentication_rate_limit_attempt_count" CHECK (
    "attempt_count" >= 1
  ),
  CONSTRAINT "authentication_rate_limit_window" CHECK (
    "expires_at" > "window_started_at"
  )
);

CREATE INDEX IF NOT EXISTS "authentication_rate_limit_buckets_expires_at_idx"
  ON "authentication_rate_limit_buckets"("expires_at");
CREATE INDEX IF NOT EXISTS "authentication_rate_limit_buckets_environment_scope_hash_expires_at_idx"
  ON "authentication_rate_limit_buckets"("environment", "scope_hash", "expires_at");
