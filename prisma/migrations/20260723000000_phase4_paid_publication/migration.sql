CREATE TYPE "payment_checkout_state" AS ENUM (
  'CREATING',
  'OPEN',
  'COMPLETE',
  'EXPIRED',
  'CANCELED',
  'FAILED'
);
CREATE TYPE "payment_state" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED');
CREATE TYPE "payment_fulfillment_state" AS ENUM (
  'NOT_STARTED',
  'PROCESSING',
  'RETRYING',
  'FULFILLED',
  'BLOCKED',
  'MANUAL_REVIEW'
);
CREATE TYPE "stripe_webhook_processing_state" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'IGNORED',
  'FAILED'
);

CREATE TABLE "payment_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "organizer_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "approval_id" UUID NOT NULL,
  "approved_revision" INTEGER NOT NULL,
  "approved_digest" CHAR(64) NOT NULL,
  "attempt_generation" INTEGER NOT NULL,
  "environment" VARCHAR(16) NOT NULL,
  "stripe_checkout_session_id" VARCHAR(255),
  "stripe_payment_intent_id" VARCHAR(255),
  "stripe_price_id" VARCHAR(255) NOT NULL,
  "expected_amount" INTEGER NOT NULL,
  "expected_currency" CHAR(3) NOT NULL,
  "checkout_state" "payment_checkout_state" NOT NULL DEFAULT 'CREATING',
  "payment_state" "payment_state" NOT NULL DEFAULT 'UNPAID',
  "fulfillment_state" "payment_fulfillment_state" NOT NULL DEFAULT 'NOT_STARTED',
  "expires_at" TIMESTAMPTZ(3),
  "paid_at" TIMESTAMPTZ(3),
  "fulfilled_at" TIMESTAMPTZ(3),
  "last_reconciled_at" TIMESTAMPTZ(3),
  "failure_reason" VARCHAR(500),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_attempts_revision_values" CHECK (
    "approved_revision" >= 1
    AND "attempt_generation" >= 1
    AND "version" >= 1
  ),
  CONSTRAINT "payment_attempts_digest" CHECK (
    "approved_digest" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "payment_attempts_environment" CHECK (
    "environment" IN ('local', 'test', 'preview', 'production')
  ),
  CONSTRAINT "payment_attempts_price" CHECK (
    "expected_amount" > 0
    AND "expected_currency" ~ '^[a-z]{3}$'
    AND char_length(btrim("stripe_price_id")) > 0
  ),
  CONSTRAINT "payment_attempts_checkout_identity" CHECK (
    (
      "checkout_state" = 'CREATING'
      AND "stripe_checkout_session_id" IS NULL
      AND "expires_at" IS NULL
    )
    OR (
      "checkout_state" IN ('OPEN', 'COMPLETE', 'EXPIRED', 'CANCELED')
      AND "stripe_checkout_session_id" IS NOT NULL
      AND "expires_at" IS NOT NULL
    )
    OR "checkout_state" = 'FAILED'
  ),
  CONSTRAINT "payment_attempts_payment_consistency" CHECK (
    (
      "payment_state" = 'PAID'
      AND "paid_at" IS NOT NULL
      AND "checkout_state" = 'COMPLETE'
      AND "stripe_checkout_session_id" IS NOT NULL
    )
    OR (
      "payment_state" <> 'PAID'
      AND "paid_at" IS NULL
    )
  ),
  CONSTRAINT "payment_attempts_fulfillment_consistency" CHECK (
    (
      "fulfillment_state" = 'FULFILLED'
      AND "payment_state" = 'PAID'
      AND "fulfilled_at" IS NOT NULL
      AND "failure_reason" IS NULL
    )
    OR (
      "fulfillment_state" IN ('BLOCKED', 'MANUAL_REVIEW')
      AND "payment_state" = 'PAID'
      AND "fulfilled_at" IS NULL
      AND "failure_reason" IS NOT NULL
    )
    OR (
      "fulfillment_state" IN ('NOT_STARTED', 'PROCESSING', 'RETRYING')
      AND "fulfilled_at" IS NULL
    )
  )
);

CREATE TABLE "stripe_webhook_events" (
  "id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "checkout_session_id" VARCHAR(255),
  "stripe_created_at" TIMESTAMPTZ(3),
  "first_received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_state" "stripe_webhook_processing_state" NOT NULL DEFAULT 'RECEIVED',
  "processed_at" TIMESTAMPTZ(3),
  "failure_reason" VARCHAR(500),
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stripe_webhook_events_retry_count" CHECK ("retry_count" >= 0),
  CONSTRAINT "stripe_webhook_events_processing_consistency" CHECK (
    (
      "processing_state" IN ('PROCESSED', 'IGNORED')
      AND "processed_at" IS NOT NULL
      AND "failure_reason" IS NULL
    )
    OR (
      "processing_state" = 'FAILED'
      AND "processed_at" IS NULL
      AND "failure_reason" IS NOT NULL
    )
    OR (
      "processing_state" IN ('RECEIVED', 'PROCESSING')
      AND "processed_at" IS NULL
    )
  )
);

CREATE TABLE "event_publications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "payment_attempt_id" UUID NOT NULL,
  "approved_revision" INTEGER NOT NULL,
  "approval_digest" CHAR(64) NOT NULL,
  "public_id" VARCHAR(12) NOT NULL,
  "canonical_path" VARCHAR(255) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "published_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_publications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_publications_revision" CHECK ("approved_revision" >= 1),
  CONSTRAINT "event_publications_digest" CHECK (
    "approval_digest" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "event_publications_public_id" CHECK (
    "public_id" ~ '^[0-9a-f]{12}$'
  ),
  CONSTRAINT "event_publications_canonical_path" CHECK (
    "canonical_path" ~ '^/(estate-sales|yard-sales)/[a-z0-9-]+-[0-9a-f]{12}$'
  ),
  CONSTRAINT "event_publications_snapshot_object" CHECK (
    jsonb_typeof("snapshot") = 'object'
  )
);

CREATE UNIQUE INDEX "payment_attempts_stripe_checkout_session_id_key"
  ON "payment_attempts"("stripe_checkout_session_id");
CREATE UNIQUE INDEX "payment_attempts_stripe_payment_intent_id_key"
  ON "payment_attempts"("stripe_payment_intent_id");
CREATE UNIQUE INDEX "payment_attempts_event_id_attempt_generation_key"
  ON "payment_attempts"("event_id", "attempt_generation");
CREATE UNIQUE INDEX "payment_attempts_one_active_checkout_per_event"
  ON "payment_attempts"("event_id")
  WHERE "checkout_state" IN ('CREATING', 'OPEN', 'COMPLETE')
    AND "payment_state" IN ('UNPAID', 'PENDING');
CREATE INDEX "payment_attempts_event_id_created_at_idx"
  ON "payment_attempts"("event_id", "created_at");
CREATE INDEX "payment_attempts_recovery_idx"
  ON "payment_attempts"(
    "checkout_state", "payment_state", "fulfillment_state", "updated_at"
  );
CREATE INDEX "payment_attempts_last_reconciled_at_idx"
  ON "payment_attempts"("last_reconciled_at");

CREATE INDEX "stripe_webhook_events_processing_state_first_received_at_idx"
  ON "stripe_webhook_events"("processing_state", "first_received_at");
CREATE INDEX "stripe_webhook_events_checkout_session_id_idx"
  ON "stripe_webhook_events"("checkout_session_id");

CREATE UNIQUE INDEX "event_publications_event_id_key"
  ON "event_publications"("event_id");
CREATE UNIQUE INDEX "event_publications_payment_attempt_id_key"
  ON "event_publications"("payment_attempt_id");
CREATE UNIQUE INDEX "event_publications_public_id_key"
  ON "event_publications"("public_id");
CREATE UNIQUE INDEX "event_publications_canonical_path_key"
  ON "event_publications"("canonical_path");
CREATE INDEX "event_publications_published_at_idx"
  ON "event_publications"("published_at");

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_organizer_id_fkey"
  FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "event_approvals"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_publications" ADD CONSTRAINT "event_publications_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_publications" ADD CONSTRAINT "event_publications_payment_attempt_id_fkey"
  FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_payment_attempt_correlation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "events" e
    JOIN "organizer_profiles" o ON o."id" = e."organizer_id"
    JOIN "event_approvals" a ON a."event_id" = e."id"
    WHERE e."id" = NEW."event_id"
      AND e."organizer_id" = NEW."organizer_id"
      AND o."user_id" = NEW."user_id"
      AND a."id" = NEW."approval_id"
      AND a."organizer_id" = NEW."organizer_id"
      AND a."accepted_by_user_id" = NEW."user_id"
      AND a."content_revision" = NEW."approved_revision"
      AND a."approval_digest" = NEW."approved_digest"
  ) THEN
    RAISE EXCEPTION 'payment attempt approval identity does not match the event';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_attempts_correlation
BEFORE INSERT ON "payment_attempts"
FOR EACH ROW EXECUTE FUNCTION enforce_payment_attempt_correlation();

CREATE OR REPLACE FUNCTION prevent_payment_attempt_correlation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."organizer_id" IS DISTINCT FROM OLD."organizer_id"
    OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
    OR NEW."approval_id" IS DISTINCT FROM OLD."approval_id"
    OR NEW."approved_revision" IS DISTINCT FROM OLD."approved_revision"
    OR NEW."approved_digest" IS DISTINCT FROM OLD."approved_digest"
    OR NEW."attempt_generation" IS DISTINCT FROM OLD."attempt_generation"
    OR NEW."environment" IS DISTINCT FROM OLD."environment"
    OR NEW."stripe_price_id" IS DISTINCT FROM OLD."stripe_price_id"
    OR NEW."expected_amount" IS DISTINCT FROM OLD."expected_amount"
    OR NEW."expected_currency" IS DISTINCT FROM OLD."expected_currency"
  THEN
    RAISE EXCEPTION 'payment attempt correlation and price fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_attempts_immutable_correlation
BEFORE UPDATE ON "payment_attempts"
FOR EACH ROW EXECUTE FUNCTION prevent_payment_attempt_correlation_mutation();

CREATE OR REPLACE FUNCTION enforce_event_publication_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "payment_attempts" p
    JOIN "events" e ON e."id" = p."event_id"
    WHERE p."id" = NEW."payment_attempt_id"
      AND p."event_id" = NEW."event_id"
      AND p."payment_state" = 'PAID'
      AND p."approved_revision" = NEW."approved_revision"
      AND p."approved_digest" = NEW."approval_digest"
      AND e."public_id" = NEW."public_id"
  ) THEN
    RAISE EXCEPTION 'event publication requires a matching paid attempt';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_publications_paid_correlation
BEFORE INSERT ON "event_publications"
FOR EACH ROW EXECUTE FUNCTION enforce_event_publication_payment();

CREATE OR REPLACE FUNCTION prevent_event_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'event_publications are immutable';
END;
$$;

CREATE TRIGGER event_publications_immutable
BEFORE UPDATE OR DELETE ON "event_publications"
FOR EACH ROW EXECUTE FUNCTION prevent_event_publication_mutation();
