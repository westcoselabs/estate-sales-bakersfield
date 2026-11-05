CREATE TABLE "audience_contacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(320) NOT NULL UNIQUE,
  "first_name" VARCHAR(120) NOT NULL DEFAULT '',
  "last_name" VARCHAR(120) NOT NULL DEFAULT '',
  "category" VARCHAR(30) NOT NULL CHECK ("category" IN ('ATTENDEE', 'BUSINESS_OWNER')),
  "status" VARCHAR(30) NOT NULL CHECK ("status" IN ('SUBSCRIBED', 'UNSUBSCRIBED', 'CLEANED')),
  "source_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "consent_confirmed_at" TIMESTAMPTZ(3),
  "suppressed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audience_contacts_email_normalized" CHECK ("email" = lower(trim("email"))),
  CONSTRAINT "audience_contacts_permission" CHECK ("status" <> 'SUBSCRIBED' OR "consent_confirmed_at" IS NOT NULL)
);
CREATE INDEX "audience_contacts_category_status_idx" ON "audience_contacts" ("category", "status");
CREATE INDEX "audience_contacts_source_tags_idx" ON "audience_contacts" USING GIN ("source_tags");
CREATE TABLE "audience_contact_imports" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "digest" CHAR(64) NOT NULL UNIQUE,
  "source_tag" VARCHAR(80) NOT NULL,
  "category" VARCHAR(30) NOT NULL,
  "summary" JSONB NOT NULL,
  "imported_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "consent_confirmed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
