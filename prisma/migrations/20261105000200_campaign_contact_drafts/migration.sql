ALTER TYPE "email_campaign_selection_mode" ADD VALUE 'CONTACT_SEGMENT';
ALTER TABLE "email_campaigns"
  ALTER COLUMN "template_revision_id" DROP NOT NULL,
  ADD COLUMN "draft_html" TEXT,
  ADD COLUMN "contact_category" VARCHAR(30),
  ADD COLUMN "contact_source_tag" VARCHAR(80),
  ADD CONSTRAINT "email_campaign_content_source" CHECK (num_nonnulls("template_revision_id", "draft_html") = 1),
  ADD CONSTRAINT "email_campaign_contact_audience" CHECK (
    ("selection_mode"::text = 'CONTACT_SEGMENT' AND "contact_category" IS NOT NULL
      AND "contact_category" IN ('ATTENDEE', 'BUSINESS_OWNER')
      AND "contact_source_tag" IS NOT NULL AND length(trim("contact_source_tag")) > 0)
    OR ("selection_mode"::text <> 'CONTACT_SEGMENT' AND "contact_category" IS NULL AND "contact_source_tag" IS NULL)
  ),
  ADD CONSTRAINT "email_campaign_imported_draft_only" CHECK (
    ("draft_html" IS NULL AND "selection_mode"::text <> 'CONTACT_SEGMENT')
    OR ("status" = 'DRAFT' AND "tested_at" IS NULL AND "sent_at" IS NULL
      AND "provider_segment_id" IS NULL AND "provider_contact_import_id" IS NULL AND "provider_broadcast_id" IS NULL)
  );
