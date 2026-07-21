CREATE TYPE "event_type" AS ENUM ('ESTATE_SALE', 'YARD_SALE');
CREATE TYPE "event_origin" AS ENUM (
  'OWNER_CREATED',
  'ADMIN_IMPORTED',
  'PARTNER_FEED'
);
CREATE TYPE "address_privacy_mode" AS ENUM (
  'EXACT_ADDRESS',
  'APPROXIMATE_LOCATION',
  'HIDDEN_UNTIL_START'
);
CREATE TYPE "event_workflow_state" AS ENUM (
  'INCOMPLETE_DRAFT',
  'PREVIEW_READY',
  'APPROVED_FOR_PAYMENT'
);
CREATE TYPE "event_approval_status" AS ENUM ('NOT_APPROVED', 'APPROVED');
CREATE TYPE "location_validation_status" AS ENUM (
  'UNVALIDATED',
  'VERIFIED',
  'LOW_CONFIDENCE'
);
CREATE TYPE "event_photo_status" AS ENUM (
  'RESERVED',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED'
);

CREATE TABLE "events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizer_id" UUID NOT NULL,
  "public_id" VARCHAR(12) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "title" VARCHAR(120),
  "description" VARCHAR(5000),
  "event_type" "event_type" NOT NULL,
  "origin" "event_origin" NOT NULL DEFAULT 'OWNER_CREATED',
  "local_starts_at" VARCHAR(16),
  "local_ends_at" VARCHAR(16),
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "timezone" VARCHAR(64),
  "privacy_mode" "address_privacy_mode",
  "workflow_state" "event_workflow_state" NOT NULL DEFAULT 'INCOMPLETE_DRAFT',
  "approval_status" "event_approval_status" NOT NULL DEFAULT 'NOT_APPROVED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "content_revision" INTEGER NOT NULL DEFAULT 1,
  "approved_revision" INTEGER,
  "approval_digest" CHAR(64),
  "approved_at" TIMESTAMPTZ(3),
  "terms_version" VARCHAR(50),
  "terms_accepted_at" TIMESTAMPTZ(3),
  "terms_accepted_by_user_id" UUID,
  "current_approval_id" UUID,
  "cover_photo_id" UUID,
  "canceled_at" TIMESTAMPTZ(3),
  "cancellation_reason" VARCHAR(500),
  "removed_at" TIMESTAMPTZ(3),
  "removal_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "events_owner_created_only_phase3" CHECK (
    "origin" = 'OWNER_CREATED'
  ),
  CONSTRAINT "events_slug_length" CHECK (
    char_length("slug") BETWEEN 1 AND 100
  ),
  CONSTRAINT "events_title_length" CHECK (
    "title" IS NULL OR char_length(btrim("title")) BETWEEN 3 AND 120
  ),
  CONSTRAINT "events_description_length" CHECK (
    "description" IS NULL
    OR char_length(btrim("description")) BETWEEN 20 AND 5000
  ),
  CONSTRAINT "events_revision_values" CHECK (
    "version" >= 1
    AND "content_revision" >= 1
    AND ("approved_revision" IS NULL OR "approved_revision" >= 1)
  ),
  CONSTRAINT "events_schedule_consistency" CHECK (
    (
      "local_starts_at" IS NULL
      AND "local_ends_at" IS NULL
      AND "starts_at" IS NULL
      AND "ends_at" IS NULL
      AND "timezone" IS NULL
    )
    OR (
      "local_starts_at" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
      AND "local_ends_at" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
      AND "starts_at" IS NOT NULL
      AND "ends_at" IS NOT NULL
      AND "timezone" IS NOT NULL
      AND "ends_at" > "starts_at"
    )
  ),
  CONSTRAINT "events_approval_consistency" CHECK (
    (
      "approval_status" = 'NOT_APPROVED'
      AND "workflow_state" <> 'APPROVED_FOR_PAYMENT'
      AND "approved_revision" IS NULL
      AND "approval_digest" IS NULL
      AND "approved_at" IS NULL
      AND "terms_version" IS NULL
      AND "terms_accepted_at" IS NULL
      AND "terms_accepted_by_user_id" IS NULL
      AND "current_approval_id" IS NULL
    )
    OR (
      "approval_status" = 'APPROVED'
      AND "workflow_state" = 'APPROVED_FOR_PAYMENT'
      AND "approved_revision" = "content_revision"
      AND "approval_digest" ~ '^[0-9a-f]{64}$'
      AND "approved_at" IS NOT NULL
      AND "terms_version" IS NOT NULL
      AND "terms_accepted_at" IS NOT NULL
      AND "terms_accepted_by_user_id" IS NOT NULL
      AND "current_approval_id" IS NOT NULL
    )
  ),
  CONSTRAINT "events_cancellation_consistency" CHECK (
    ("canceled_at" IS NULL) = ("cancellation_reason" IS NULL)
  ),
  CONSTRAINT "events_removal_consistency" CHECK (
    ("removed_at" IS NULL) = ("removal_reason" IS NULL)
  )
);

CREATE TABLE "event_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "address_line_1" VARCHAR(200) NOT NULL,
  "address_line_2" VARCHAR(100),
  "city" VARCHAR(100) NOT NULL,
  "region" VARCHAR(100) NOT NULL,
  "postal_code" VARCHAR(20) NOT NULL,
  "country_code" CHAR(2) NOT NULL,
  "normalized_address" VARCHAR(500) NOT NULL,
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "coordinates" geography(Point, 4326),
  "timezone" VARCHAR(64) NOT NULL,
  "provider_place_id" VARCHAR(255) NOT NULL,
  "provider_name" VARCHAR(50) NOT NULL,
  "precision" VARCHAR(50),
  "confidence" DECIMAL(5, 4),
  "validation_status" "location_validation_status" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_locations_coordinates" CHECK (
    "latitude" BETWEEN -90 AND 90
    AND "longitude" BETWEEN -180 AND 180
    AND (
      "validation_status" <> 'VERIFIED'
      OR "coordinates" IS NOT NULL
    )
  ),
  CONSTRAINT "event_locations_country_code" CHECK (
    "country_code" ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT "event_locations_confidence" CHECK (
    "confidence" IS NULL OR "confidence" BETWEEN 0 AND 1
  )
);

CREATE TABLE "event_photos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "status" "event_photo_status" NOT NULL DEFAULT 'RESERVED',
  "sort_order" INTEGER NOT NULL,
  "staging_object_key" VARCHAR(500),
  "dashboard_thumbnail_key" VARCHAR(500),
  "listing_card_key" VARCHAR(500),
  "gallery_key" VARCHAR(500),
  "cover_display_key" VARCHAR(500),
  "dashboard_thumbnail_hash" CHAR(64),
  "listing_card_hash" CHAR(64),
  "gallery_hash" CHAR(64),
  "cover_display_hash" CHAR(64),
  "source_content_type" VARCHAR(100),
  "source_size" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "error_code" VARCHAR(100),
  "ready_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_photos_sort_order" CHECK ("sort_order" >= 0),
  CONSTRAINT "event_photos_dimensions" CHECK (
    ("width" IS NULL AND "height" IS NULL)
    OR ("width" > 0 AND "height" > 0)
  ),
  CONSTRAINT "event_photos_source_size" CHECK (
    "source_size" IS NULL OR "source_size" > 0
  ),
  CONSTRAINT "event_photos_ready_consistency" CHECK (
    "status" <> 'READY'
    OR (
      "staging_object_key" IS NULL
      AND "dashboard_thumbnail_key" IS NOT NULL
      AND "listing_card_key" IS NOT NULL
      AND "gallery_key" IS NOT NULL
      AND "cover_display_key" IS NOT NULL
      AND "dashboard_thumbnail_hash" ~ '^[0-9a-f]{64}$'
      AND "listing_card_hash" ~ '^[0-9a-f]{64}$'
      AND "gallery_hash" ~ '^[0-9a-f]{64}$'
      AND "cover_display_hash" ~ '^[0-9a-f]{64}$'
      AND "ready_at" IS NOT NULL
      AND "error_code" IS NULL
    )
  )
);

CREATE TABLE "upload_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "photo_id" UUID NOT NULL,
  "staging_object_key" VARCHAR(500) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "upload_reservations_expiry" CHECK (
    "expires_at" > "created_at"
  )
);

CREATE TABLE "event_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "organizer_id" UUID NOT NULL,
  "accepted_by_user_id" UUID NOT NULL,
  "content_revision" INTEGER NOT NULL,
  "approval_digest" CHAR(64) NOT NULL,
  "terms_version" VARCHAR(50) NOT NULL,
  "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
  "approved_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_approvals_revision" CHECK ("content_revision" >= 1),
  CONSTRAINT "event_approvals_digest" CHECK (
    "approval_digest" ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX "events_public_id_key" ON "events"("public_id");
CREATE UNIQUE INDEX "events_current_approval_id_key" ON "events"("current_approval_id");
CREATE INDEX "events_organizer_id_updated_at_idx" ON "events"("organizer_id", "updated_at");
CREATE INDEX "events_workflow_state_updated_at_idx" ON "events"("workflow_state", "updated_at");
CREATE INDEX "events_event_type_starts_at_idx" ON "events"("event_type", "starts_at");
CREATE UNIQUE INDEX "event_locations_event_id_key" ON "event_locations"("event_id");
CREATE INDEX "event_locations_city_region_idx" ON "event_locations"("city", "region");
CREATE INDEX "event_locations_validation_status_idx" ON "event_locations"("validation_status");
CREATE INDEX "event_locations_coordinates_gix" ON "event_locations" USING GIST ("coordinates");
CREATE UNIQUE INDEX "event_photos_staging_object_key_key" ON "event_photos"("staging_object_key");
CREATE UNIQUE INDEX "event_photos_dashboard_thumbnail_key_key" ON "event_photos"("dashboard_thumbnail_key");
CREATE UNIQUE INDEX "event_photos_listing_card_key_key" ON "event_photos"("listing_card_key");
CREATE UNIQUE INDEX "event_photos_gallery_key_key" ON "event_photos"("gallery_key");
CREATE UNIQUE INDEX "event_photos_cover_display_key_key" ON "event_photos"("cover_display_key");
CREATE INDEX "event_photos_event_id_sort_order_idx" ON "event_photos"("event_id", "sort_order");
CREATE INDEX "event_photos_event_id_status_idx" ON "event_photos"("event_id", "status");
CREATE UNIQUE INDEX "upload_reservations_photo_id_key" ON "upload_reservations"("photo_id");
CREATE UNIQUE INDEX "upload_reservations_staging_object_key_key" ON "upload_reservations"("staging_object_key");
CREATE INDEX "upload_reservations_event_id_expires_at_idx" ON "upload_reservations"("event_id", "expires_at");
CREATE INDEX "event_approvals_event_id_approved_at_idx" ON "event_approvals"("event_id", "approved_at");
CREATE UNIQUE INDEX "event_approvals_event_id_content_revision_key" ON "event_approvals"("event_id", "content_revision");
CREATE INDEX "event_approvals_organizer_id_approved_at_idx" ON "event_approvals"("organizer_id", "approved_at");

ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey"
  FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_terms_accepted_by_user_id_fkey"
  FOREIGN KEY ("terms_accepted_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_locations" ADD CONSTRAINT "event_locations_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_reservations" ADD CONSTRAINT "upload_reservations_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_reservations" ADD CONSTRAINT "upload_reservations_photo_id_fkey"
  FOREIGN KEY ("photo_id") REFERENCES "event_photos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_approvals" ADD CONSTRAINT "event_approvals_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_approvals" ADD CONSTRAINT "event_approvals_organizer_id_fkey"
  FOREIGN KEY ("organizer_id") REFERENCES "organizer_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_approvals" ADD CONSTRAINT "event_approvals_accepted_by_user_id_fkey"
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_cover_photo_id_fkey"
  FOREIGN KEY ("cover_photo_id") REFERENCES "event_photos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_current_approval_id_fkey"
  FOREIGN KEY ("current_approval_id") REFERENCES "event_approvals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_event_photo_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1 FROM "events" WHERE "id" = NEW."event_id" FOR UPDATE;
  IF (SELECT count(*) FROM "event_photos" WHERE "event_id" = NEW."event_id") >= 150 THEN
    RAISE EXCEPTION 'an event may not contain more than 150 photos';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_photos_limit
BEFORE INSERT ON "event_photos"
FOR EACH ROW EXECUTE FUNCTION enforce_event_photo_limit();

CREATE OR REPLACE FUNCTION enforce_upload_reservation_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "event_photos"
    WHERE "id" = NEW."photo_id" AND "event_id" = NEW."event_id"
  ) THEN
    RAISE EXCEPTION 'upload reservation photo must belong to the event';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER upload_reservations_ownership
BEFORE INSERT OR UPDATE ON "upload_reservations"
FOR EACH ROW EXECUTE FUNCTION enforce_upload_reservation_ownership();

CREATE OR REPLACE FUNCTION enforce_event_cover_photo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."cover_photo_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "event_photos"
    WHERE "id" = NEW."cover_photo_id"
      AND "event_id" = NEW."id"
      AND "status" = 'READY'
  ) THEN
    RAISE EXCEPTION 'cover photo must be a READY photo owned by the event';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_cover_photo_ownership
BEFORE INSERT OR UPDATE OF "cover_photo_id" ON "events"
FOR EACH ROW EXECUTE FUNCTION enforce_event_cover_photo();

CREATE OR REPLACE FUNCTION prevent_cover_photo_invalidation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "events" WHERE "cover_photo_id" = OLD."id"
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'clear or replace the event cover before deleting the cover photo';
    ELSIF NEW."status" <> 'READY' OR NEW."event_id" <> OLD."event_id" THEN
      RAISE EXCEPTION 'clear or replace the event cover before changing the cover photo';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER event_photos_preserve_cover
BEFORE UPDATE OR DELETE ON "event_photos"
FOR EACH ROW EXECUTE FUNCTION prevent_cover_photo_invalidation();

CREATE OR REPLACE FUNCTION enforce_event_approval_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "events" e
    JOIN "organizer_profiles" o ON o."id" = e."organizer_id"
    WHERE e."id" = NEW."event_id"
      AND e."organizer_id" = NEW."organizer_id"
      AND o."user_id" = NEW."accepted_by_user_id"
      AND e."content_revision" = NEW."content_revision"
  ) THEN
    RAISE EXCEPTION 'event approval identity or revision does not match the event';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_approvals_ownership
BEFORE INSERT ON "event_approvals"
FOR EACH ROW EXECUTE FUNCTION enforce_event_approval_ownership();

CREATE OR REPLACE FUNCTION enforce_current_event_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."approval_status" = 'APPROVED' AND NOT EXISTS (
    SELECT 1 FROM "event_approvals" a
    WHERE a."id" = NEW."current_approval_id"
      AND a."event_id" = NEW."id"
      AND a."organizer_id" = NEW."organizer_id"
      AND a."accepted_by_user_id" = NEW."terms_accepted_by_user_id"
      AND a."content_revision" = NEW."approved_revision"
      AND a."approval_digest" = NEW."approval_digest"
      AND a."terms_version" = NEW."terms_version"
      AND a."terms_accepted_at" = NEW."terms_accepted_at"
      AND a."approved_at" = NEW."approved_at"
  ) THEN
    RAISE EXCEPTION 'current event approval proof does not match the approved event';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_current_approval_consistency
BEFORE INSERT OR UPDATE OF
  "approval_status",
  "current_approval_id",
  "approved_revision",
  "approval_digest",
  "terms_version",
  "terms_accepted_at",
  "terms_accepted_by_user_id",
  "approved_at"
ON "events"
FOR EACH ROW EXECUTE FUNCTION enforce_current_event_approval();
