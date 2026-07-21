CREATE TYPE "organizer_status" AS ENUM ('INCOMPLETE', 'COMPLETE');
CREATE TYPE "email_delivery_kind" AS ENUM (
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET'
);
CREATE TYPE "email_delivery_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "users"
  ADD COLUMN "display_name" VARCHAR(100);

UPDATE "users"
SET "display_name" = 'Existing user'
WHERE "display_name" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "display_name" SET NOT NULL,
  ADD CONSTRAINT "users_display_name_length"
    CHECK (char_length(btrim("display_name")) BETWEEN 2 AND 100);

ALTER TABLE "email_verification_tokens"
  ADD COLUMN "invalidated_at" TIMESTAMPTZ(3);

ALTER TABLE "password_reset_tokens"
  ADD COLUMN "invalidated_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "email_verification_tokens_one_active_per_user"
  ON "email_verification_tokens" ("user_id")
  WHERE "consumed_at" IS NULL AND "invalidated_at" IS NULL;

CREATE UNIQUE INDEX "password_reset_tokens_one_active_per_user"
  ON "password_reset_tokens" ("user_id")
  WHERE "consumed_at" IS NULL AND "invalidated_at" IS NULL;

CREATE TABLE "organizer_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "display_name" VARCHAR(100),
  "contact_name" VARCHAR(100),
  "contact_email" VARCHAR(320),
  "contact_phone" VARCHAR(32),
  "website_url" VARCHAR(2048),
  "status" "organizer_status" NOT NULL DEFAULT 'INCOMPLETE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "organizer_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizer_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organizer_profiles_display_name_length"
    CHECK (
      "display_name" IS NULL
      OR char_length(btrim("display_name")) BETWEEN 2 AND 100
    ),
  CONSTRAINT "organizer_profiles_contact_name_length"
    CHECK (
      "contact_name" IS NULL
      OR char_length(btrim("contact_name")) BETWEEN 2 AND 100
    ),
  CONSTRAINT "organizer_profiles_contact_email_length"
    CHECK (
      "contact_email" IS NULL
      OR char_length("contact_email") BETWEEN 3 AND 320
    ),
  CONSTRAINT "organizer_profiles_contact_phone_length"
    CHECK (
      "contact_phone" IS NULL
      OR char_length("contact_phone") BETWEEN 7 AND 32
    ),
  CONSTRAINT "organizer_profiles_complete_fields"
    CHECK (
      "status" = 'INCOMPLETE'
      OR (
        "display_name" IS NOT NULL
        AND "contact_name" IS NOT NULL
        AND "contact_email" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "organizer_profiles_user_id_key"
  ON "organizer_profiles" ("user_id");
CREATE INDEX "organizer_profiles_status_idx"
  ON "organizer_profiles" ("status");

CREATE TABLE "email_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "kind" "email_delivery_kind" NOT NULL,
  "status" "email_delivery_status" NOT NULL DEFAULT 'PENDING',
  "provider" VARCHAR(50) NOT NULL DEFAULT 'resend',
  "provider_message_id" VARCHAR(255),
  "recipient_hash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(100),
  "sent_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_deliveries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "email_deliveries_recipient_hash_format"
    CHECK ("recipient_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "email_deliveries_attempts_nonnegative"
    CHECK ("attempts" >= 0),
  CONSTRAINT "email_deliveries_status_consistency"
    CHECK (
      (
        "status" = 'PENDING'
        AND "sent_at" IS NULL
        AND "failed_at" IS NULL
      )
      OR (
        "status" = 'SENT'
        AND "provider_message_id" IS NOT NULL
        AND "sent_at" IS NOT NULL
        AND "failed_at" IS NULL
      )
      OR (
        "status" = 'FAILED'
        AND "sent_at" IS NULL
        AND "failed_at" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "email_deliveries_provider_provider_message_id_key"
  ON "email_deliveries" ("provider", "provider_message_id");
CREATE INDEX "email_deliveries_user_id_kind_created_at_idx"
  ON "email_deliveries" ("user_id", "kind", "created_at");
CREATE INDEX "email_deliveries_status_created_at_idx"
  ON "email_deliveries" ("status", "created_at");
