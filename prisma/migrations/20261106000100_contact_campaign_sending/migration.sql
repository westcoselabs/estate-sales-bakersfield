ALTER TABLE "email_campaigns" DROP CONSTRAINT "email_campaign_imported_draft_only";

CREATE TABLE "email_campaign_contact_recipients" (
  "campaign_id" UUID NOT NULL REFERENCES "email_campaigns"("id") ON DELETE CASCADE,
  "contact_id" UUID NOT NULL REFERENCES "audience_contacts"("id") ON DELETE RESTRICT,
  "email" VARCHAR(320) NOT NULL,
  "first_name" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("campaign_id", "contact_id")
);
CREATE UNIQUE INDEX "email_campaign_contact_recipients_campaign_id_email_key" ON "email_campaign_contact_recipients"("campaign_id", "email");
CREATE INDEX "email_campaign_contact_recipients_contact_id_idx" ON "email_campaign_contact_recipients"("contact_id");

CREATE TRIGGER "email_campaign_contact_recipients_immutable"
BEFORE UPDATE OR DELETE ON "email_campaign_contact_recipients"
FOR EACH ROW EXECUTE FUNCTION prevent_email_campaign_recipient_mutation();
