DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "users" WHERE "role" = 'ADMIN') > 1 THEN
    RAISE EXCEPTION 'super-admin migration requires at most one existing ADMIN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "role" = 'ADMIN'
      AND ("status" <> 'ACTIVE' OR "email_verified_at" IS NULL)
  ) THEN
    RAISE EXCEPTION 'the existing ADMIN must be active and email verified';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE
      (
        "status" = 'RESTRICTED'
        AND (
          "restricted_at" IS NULL
          OR "restriction_reason" IS NULL
          OR length(trim("restriction_reason")) = 0
        )
      )
      OR (
        "status" <> 'RESTRICTED'
        AND ("restricted_at" IS NOT NULL OR "restriction_reason" IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION 'user restriction fields must be normalized before the super-admin migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "events"
    WHERE
      (
        "removed_at" IS NOT NULL
        AND (
          "removal_reason" IS NULL
          OR length(trim("removal_reason")) = 0
        )
      )
      OR ("removed_at" IS NULL AND "removal_reason" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'event removal fields must be normalized before the super-admin migration';
  END IF;
END;
$$;

ALTER TYPE "user_role" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';

CREATE TYPE "marketing_consent_source" AS ENUM (
  'SIGNUP',
  'ACCOUNT_SETTINGS'
);

ALTER TABLE "sessions"
ADD COLUMN "password_authenticated_at" TIMESTAMPTZ(3);

UPDATE "sessions"
SET "password_authenticated_at" = "created_at";

ALTER TABLE "sessions"
ALTER COLUMN "password_authenticated_at" SET NOT NULL;

DELETE FROM "sessions"
USING "users"
WHERE "sessions"."user_id" = "users"."id"
  AND "users"."role" = 'SUPER_ADMIN';

CREATE TABLE "marketing_preferences" (
  "user_id" UUID NOT NULL,
  "consent_at" TIMESTAMPTZ(3),
  "consent_version" VARCHAR(50),
  "consent_source" "marketing_consent_source",
  "unsubscribed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_preferences_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "marketing_preferences_consent_consistency" CHECK (
    (
      "consent_at" IS NULL
      AND "consent_version" IS NULL
      AND "consent_source" IS NULL
    )
    OR (
      "consent_at" IS NOT NULL
      AND "consent_version" IS NOT NULL
      AND length(trim("consent_version")) > 0
      AND "consent_source" IS NOT NULL
    )
  )
);

ALTER TABLE "marketing_preferences"
ADD CONSTRAINT "marketing_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users"
DROP CONSTRAINT "users_restriction_consistency";

ALTER TABLE "users"
ADD CONSTRAINT "users_restriction_consistency" CHECK (
  (
    "status" = 'RESTRICTED'
    AND "restricted_at" IS NOT NULL
    AND "restriction_reason" IS NOT NULL
    AND length(trim("restriction_reason")) > 0
  )
  OR (
    "status" <> 'RESTRICTED'
    AND "restricted_at" IS NULL
    AND "restriction_reason" IS NULL
  )
);

ALTER TABLE "events"
ADD CONSTRAINT "events_removal_reason_consistency" CHECK (
  (
    "removed_at" IS NOT NULL
    AND "removal_reason" IS NOT NULL
    AND length(trim("removal_reason")) > 0
  )
  OR ("removed_at" IS NULL AND "removal_reason" IS NULL)
);

CREATE UNIQUE INDEX "users_single_super_admin_idx"
ON "users"("role")
WHERE "role" = 'SUPER_ADMIN';

CREATE INDEX "users_created_at_id_idx"
ON "users"("created_at" DESC, "id" DESC);

CREATE INDEX "events_updated_at_id_idx"
ON "events"("updated_at" DESC, "id" DESC);

CREATE INDEX "events_canceled_at_idx"
ON "events"("canceled_at" DESC)
WHERE "canceled_at" IS NOT NULL;

CREATE INDEX "payment_attempts_user_id_created_at_idx"
ON "payment_attempts"("user_id", "created_at" DESC);

CREATE INDEX "payment_attempts_paid_at_currency_idx"
ON "payment_attempts"("paid_at" DESC, "expected_currency")
WHERE "payment_state" = 'PAID' AND "paid_at" IS NOT NULL;

CREATE INDEX "payment_attempts_user_paid_at_idx"
ON "payment_attempts"("user_id", "paid_at" DESC)
WHERE "payment_state" = 'PAID' AND "paid_at" IS NOT NULL;
