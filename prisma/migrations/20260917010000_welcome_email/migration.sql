ALTER TYPE "email_delivery_kind" ADD VALUE IF NOT EXISTS 'WELCOME';
ALTER TYPE "email_template_key" ADD VALUE IF NOT EXISTS 'WELCOME';

ALTER TABLE "email_templates"
  DROP CONSTRAINT "email_templates_category_check";

ALTER TABLE "email_templates"
  ADD CONSTRAINT "email_templates_category_check" CHECK (
    ("key" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'WELCOME', 'PURCHASE_RECEIPT') AND "category" = 'TRANSACTIONAL') OR
    ("key" = 'RECENT_LISTINGS' AND "category" = 'MARKETING') OR
    ("key" IS NULL AND "category" = 'MARKETING')
  );
