ALTER TYPE "email_delivery_kind" ADD VALUE IF NOT EXISTS 'PURCHASE_RECEIPT';

ALTER TYPE "email_delivery_status" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "email_delivery_status" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "email_delivery_status" ADD VALUE IF NOT EXISTS 'COMPLAINED';
ALTER TYPE "email_delivery_status" ADD VALUE IF NOT EXISTS 'SUPPRESSED';

CREATE TYPE "email_template_category" AS ENUM ('TRANSACTIONAL', 'MARKETING');
CREATE TYPE "email_template_key" AS ENUM (
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'PURCHASE_RECEIPT',
  'RECENT_LISTINGS'
);
CREATE TYPE "email_campaign_status" AS ENUM (
  'DRAFT',
  'PREPARING',
  'READY',
  'DISPATCHING',
  'SENT',
  'FAILED',
  'NEEDS_REVIEW'
);
CREATE TYPE "email_campaign_selection_mode" AS ENUM ('ALL_ELIGIBLE', 'SELECTED_USERS');
CREATE TYPE "resend_webhook_processing_state" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

CREATE TABLE "email_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" "email_template_key",
  "name" VARCHAR(100) NOT NULL,
  "category" "email_template_category" NOT NULL,
  "draft_subject" VARCHAR(200) NOT NULL,
  "draft_html" TEXT NOT NULL,
  "draft_digest" CHAR(64) NOT NULL,
  "draft_version" INTEGER NOT NULL DEFAULT 1,
  "last_tested_digest" CHAR(64),
  "last_tested_at" TIMESTAMPTZ(3),
  "active_revision_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_templates_version_check" CHECK ("draft_version" > 0),
  CONSTRAINT "email_templates_html_check" CHECK (octet_length("draft_html") BETWEEN 1 AND 256000),
  CONSTRAINT "email_templates_category_check" CHECK (
    ("key" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'PURCHASE_RECEIPT') AND "category" = 'TRANSACTIONAL') OR
    ("key" = 'RECENT_LISTINGS' AND "category" = 'MARKETING') OR
    ("key" IS NULL AND "category" = 'MARKETING')
  )
);

CREATE TABLE "email_template_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "template_id" UUID NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "html" TEXT NOT NULL,
  "content_digest" CHAR(64) NOT NULL,
  "required_variables" JSONB NOT NULL,
  "published_by_user_id" UUID NOT NULL,
  "published_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_template_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_template_revisions_number_check" CHECK ("revision_number" > 0),
  CONSTRAINT "email_template_revisions_html_check" CHECK (octet_length("html") BETWEEN 1 AND 256000)
);

CREATE TABLE "email_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "preview_text" VARCHAR(200),
  "status" "email_campaign_status" NOT NULL DEFAULT 'DRAFT',
  "selection_mode" "email_campaign_selection_mode" NOT NULL,
  "template_revision_id" UUID NOT NULL,
  "listing_snapshot" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "provider_segment_id" VARCHAR(255),
  "provider_contact_import_id" VARCHAR(255),
  "provider_broadcast_id" VARCHAR(255),
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "delivered_count" INTEGER NOT NULL DEFAULT 0,
  "bounced_count" INTEGER NOT NULL DEFAULT 0,
  "complained_count" INTEGER NOT NULL DEFAULT 0,
  "suppressed_count" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(100),
  "version" INTEGER NOT NULL DEFAULT 1,
  "tested_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_campaigns_counts_check" CHECK (
    "recipient_count" BETWEEN 0 AND 10000 AND
    "delivered_count" >= 0 AND "bounced_count" >= 0 AND
    "complained_count" >= 0 AND "suppressed_count" >= 0
  ),
  CONSTRAINT "email_campaigns_version_check" CHECK ("version" > 0)
);

CREATE TABLE "email_campaign_recipients" (
  "campaign_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY ("campaign_id", "user_id")
);

CREATE TABLE "resend_webhook_events" (
  "id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "provider_message_id" VARCHAR(255),
  "provider_broadcast_id" VARCHAR(255),
  "provider_contact_id" VARCHAR(255),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "processing_state" "resend_webhook_processing_state" NOT NULL DEFAULT 'RECEIVED',
  "processed_at" TIMESTAMPTZ(3),
  "failure_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resend_webhook_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_deliveries"
  ADD COLUMN "template_revision_id" UUID,
  ADD COLUMN "payment_attempt_id" UUID,
  ADD COLUMN "delivered_at" TIMESTAMPTZ(3),
  ADD COLUMN "bounced_at" TIMESTAMPTZ(3),
  ADD COLUMN "complained_at" TIMESTAMPTZ(3),
  ADD COLUMN "suppressed_at" TIMESTAMPTZ(3);

ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_receipt_reference_check" CHECK (
    ("kind" = 'PURCHASE_RECEIPT' AND "payment_attempt_id" IS NOT NULL) OR
    ("kind" <> 'PURCHASE_RECEIPT' AND "payment_attempt_id" IS NULL)
  );

CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");
CREATE UNIQUE INDEX "email_templates_active_revision_id_key" ON "email_templates"("active_revision_id");
CREATE INDEX "email_templates_category_archived_at_updated_at_idx" ON "email_templates"("category", "archived_at", "updated_at");
CREATE UNIQUE INDEX "email_template_revisions_template_id_revision_number_key" ON "email_template_revisions"("template_id", "revision_number");
CREATE INDEX "email_template_revisions_template_id_published_at_idx" ON "email_template_revisions"("template_id", "published_at");
CREATE UNIQUE INDEX "email_campaigns_provider_segment_id_key" ON "email_campaigns"("provider_segment_id");
CREATE UNIQUE INDEX "email_campaigns_provider_contact_import_id_key" ON "email_campaigns"("provider_contact_import_id");
CREATE UNIQUE INDEX "email_campaigns_provider_broadcast_id_key" ON "email_campaigns"("provider_broadcast_id");
CREATE INDEX "email_campaigns_status_created_at_idx" ON "email_campaigns"("status", "created_at");
CREATE INDEX "email_campaigns_created_by_user_id_created_at_idx" ON "email_campaigns"("created_by_user_id", "created_at");
CREATE INDEX "email_campaign_recipients_user_id_created_at_idx" ON "email_campaign_recipients"("user_id", "created_at");
CREATE INDEX "resend_webhook_events_processing_state_created_at_idx" ON "resend_webhook_events"("processing_state", "created_at");
CREATE INDEX "resend_webhook_events_provider_message_id_idx" ON "resend_webhook_events"("provider_message_id");
CREATE INDEX "resend_webhook_events_provider_broadcast_id_idx" ON "resend_webhook_events"("provider_broadcast_id");
CREATE UNIQUE INDEX "email_deliveries_payment_attempt_id_key" ON "email_deliveries"("payment_attempt_id");
CREATE INDEX "email_deliveries_template_revision_id_created_at_idx" ON "email_deliveries"("template_revision_id", "created_at");

ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_template_revisions" ADD CONSTRAINT "email_template_revisions_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_template_revisions" ADD CONSTRAINT "email_template_revisions_published_by_user_id_fkey"
  FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_active_revision_id_fkey"
  FOREIGN KEY ("active_revision_id") REFERENCES "email_template_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_revision_id_fkey"
  FOREIGN KEY ("template_revision_id") REFERENCES "email_template_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_template_revision_id_fkey"
  FOREIGN KEY ("template_revision_id") REFERENCES "email_template_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_payment_attempt_id_fkey"
  FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_email_template_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'email template revisions are immutable';
END;
$$;

CREATE TRIGGER "email_template_revisions_immutable"
BEFORE UPDATE OR DELETE ON "email_template_revisions"
FOR EACH ROW EXECUTE FUNCTION prevent_email_template_revision_mutation();

CREATE OR REPLACE FUNCTION prevent_email_campaign_recipient_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'email campaign recipient snapshots are immutable';
END;
$$;

CREATE TRIGGER "email_campaign_recipients_immutable"
BEFORE UPDATE OR DELETE ON "email_campaign_recipients"
FOR EACH ROW EXECUTE FUNCTION prevent_email_campaign_recipient_mutation();

CREATE OR REPLACE FUNCTION enforce_active_email_template_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."active_revision_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "email_template_revisions" revision
    WHERE revision."id" = NEW."active_revision_id"
      AND revision."template_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'active email template revision must belong to the template';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "email_templates_active_revision_consistency"
BEFORE INSERT OR UPDATE OF "active_revision_id" ON "email_templates"
FOR EACH ROW EXECUTE FUNCTION enforce_active_email_template_revision();
