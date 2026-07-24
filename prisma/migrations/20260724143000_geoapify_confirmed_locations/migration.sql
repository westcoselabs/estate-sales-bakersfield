CREATE TYPE "location_confirmation_status" AS ENUM (
  'UNCONFIRMED',
  'CONFIRMED'
);

CREATE TYPE "location_resolution_source" AS ENUM (
  'ORGANIZER_AUTOCOMPLETE',
  'ADMIN_GEOCODING',
  'LEGACY_PROVIDER',
  'UNCONFIRMED_DRAFT'
);

ALTER TABLE "event_locations"
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL,
  ALTER COLUMN "provider_place_id" DROP NOT NULL,
  ALTER COLUMN "provider_name" DROP NOT NULL,
  ADD COLUMN "provider_version" varchar(50),
  ADD COLUMN "provider_attribution" varchar(255),
  ADD COLUMN "resolution_source" "location_resolution_source"
    NOT NULL DEFAULT 'UNCONFIRMED_DRAFT',
  ADD COLUMN "confirmation_status" "location_confirmation_status"
    NOT NULL DEFAULT 'UNCONFIRMED',
  ADD COLUMN "confirmed_by_user_id" uuid,
  ADD COLUMN "confirmed_at" timestamptz(3),
  ADD COLUMN "public_zone" varchar(50) NOT NULL DEFAULT 'bakersfield';

UPDATE "event_locations"
SET
  "resolution_source" = 'LEGACY_PROVIDER',
  "confirmation_status" = CASE
    WHEN "validation_status" = 'VERIFIED'
      THEN 'CONFIRMED'::"location_confirmation_status"
    ELSE 'UNCONFIRMED'::"location_confirmation_status"
  END,
  "provider_version" = CASE
    WHEN "provider_name" = 'mapbox' THEN 'geocoding-v6'
    ELSE 'legacy'
  END,
  "provider_attribution" = CASE
    WHEN "provider_name" = 'mapbox' THEN 'Legacy Mapbox geocoding result'
    ELSE 'Legacy provider result'
  END,
  "confirmed_at" = CASE
    WHEN "validation_status" = 'VERIFIED' THEN "updated_at"
    ELSE NULL
  END;

CREATE INDEX "event_locations_confirmation_status_idx"
  ON "event_locations" ("confirmation_status");

ALTER TABLE "event_locations"
  ADD CONSTRAINT "event_locations_confirmation_consistency"
  CHECK (
    (
      "confirmation_status" = 'UNCONFIRMED'
      AND "confirmed_at" IS NULL
      AND "confirmed_by_user_id" IS NULL
    )
    OR
    (
      "confirmation_status" = 'CONFIRMED'
      AND "latitude" IS NOT NULL
      AND "longitude" IS NOT NULL
      AND "coordinates" IS NOT NULL
      AND "provider_name" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
    )
  );
