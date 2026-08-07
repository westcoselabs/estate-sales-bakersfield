CREATE TYPE "listing_import_transport" AS ENUM (
  'API',
  'MANUAL_JSON',
  'MANUAL_CSV'
);

CREATE TYPE "listing_import_batch_status" AS ENUM (
  'COMPLETED',
  'PARTIAL',
  'REJECTED'
);

CREATE TYPE "listing_import_row_status" AS ENUM (
  'CANDIDATE_CREATED',
  'INVALID',
  'EXACT_DUPLICATE',
  'SOURCE_CHANGED',
  'IDENTITY_CONFLICT'
);

CREATE TYPE "listing_import_candidate_status" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'DUPLICATE_LINKED',
  'DELETED'
);

CREATE TYPE "listing_duplicate_resolution" AS ENUM (
  'UNRESOLVED',
  'NOT_DUPLICATE',
  'LINKED'
);

CREATE TYPE "external_listing_status" AS ENUM (
  'PUBLISHED',
  'EXPIRED',
  'REMOVED'
);

CREATE TABLE "listing_import_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "allowed_hosts" VARCHAR(253)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(253)[],
  "allowed_query_parameters" VARCHAR(100)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(100)[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "production_allowed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "listing_import_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_import_sources_key_format" CHECK (
    "key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT "listing_import_sources_name_not_blank" CHECK (
    char_length(btrim("name")) > 0
  ),
  CONSTRAINT "listing_import_sources_hosts_required" CHECK (
    cardinality("allowed_hosts") > 0
    AND array_position("allowed_hosts", NULL) IS NULL
  ),
  CONSTRAINT "listing_import_sources_query_parameters_not_null" CHECK (
    array_position("allowed_query_parameters", NULL) IS NULL
  )
);

CREATE TABLE "listing_ingestion_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "token_digest" CHAR(64) NOT NULL,
  "display_prefix" VARCHAR(24) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "last_used_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_ingestion_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_ingestion_credentials_name_not_blank" CHECK (
    char_length(btrim("name")) > 0
  ),
  CONSTRAINT "listing_ingestion_credentials_digest_format" CHECK (
    "token_digest" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "listing_ingestion_credentials_prefix_format" CHECK (
    "display_prefix" ~ '^esb_ing_[A-Za-z0-9_-]{1,16}$'
  ),
  CONSTRAINT "listing_ingestion_credentials_timestamps" CHECK (
    ("last_used_at" IS NULL OR "last_used_at" >= "created_at")
    AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
  )
);

CREATE TABLE "listing_import_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id" UUID NOT NULL,
  "credential_id" UUID,
  "admin_actor_user_id" UUID,
  "transport" "listing_import_transport" NOT NULL,
  "contract_version" VARCHAR(50) NOT NULL,
  "parser_version" VARCHAR(100) NOT NULL,
  "ingestor_run_id" VARCHAR(100) NOT NULL,
  "ingestor_instance_id" VARCHAR(100) NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "payload_digest" CHAR(64) NOT NULL,
  "status" "listing_import_batch_status" NOT NULL,
  "total_rows" INTEGER NOT NULL,
  "candidate_rows" INTEGER NOT NULL,
  "invalid_rows" INTEGER NOT NULL,
  "exact_duplicate_rows" INTEGER NOT NULL,
  "source_changed_rows" INTEGER NOT NULL,
  "identity_conflict_rows" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3) NOT NULL,
  "sealed_at" TIMESTAMPTZ(3),
  CONSTRAINT "listing_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_import_batches_metadata_not_blank" CHECK (
    char_length(btrim("contract_version")) > 0
    AND char_length(btrim("parser_version")) > 0
    AND char_length(btrim("ingestor_run_id")) > 0
    AND char_length(btrim("ingestor_instance_id")) > 0
  ),
  CONSTRAINT "listing_import_batches_digest_format" CHECK (
    "request_digest" ~ '^[0-9a-f]{64}$'
    AND "payload_digest" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "listing_import_batches_actor" CHECK (
    (
      "transport" = 'API'
      AND "credential_id" IS NOT NULL
      AND "admin_actor_user_id" IS NULL
    )
    OR (
      "transport" IN ('MANUAL_JSON', 'MANUAL_CSV')
      AND "credential_id" IS NULL
      AND "admin_actor_user_id" IS NOT NULL
    )
  ),
  CONSTRAINT "listing_import_batches_counts" CHECK (
    "total_rows" >= 1
    AND "candidate_rows" >= 0
    AND "invalid_rows" >= 0
    AND "exact_duplicate_rows" >= 0
    AND "source_changed_rows" >= 0
    AND "identity_conflict_rows" >= 0
    AND "candidate_rows" + "invalid_rows" + "exact_duplicate_rows"
      + "source_changed_rows" + "identity_conflict_rows" = "total_rows"
  ),
  CONSTRAINT "listing_import_batches_status_counts" CHECK (
    (
      "status" = 'COMPLETED'
      AND "invalid_rows" + "identity_conflict_rows" = 0
    )
    OR (
      "status" = 'PARTIAL'
      AND "invalid_rows" + "identity_conflict_rows" > 0
      AND "invalid_rows" + "identity_conflict_rows" < "total_rows"
    )
    OR (
      "status" = 'REJECTED'
      AND "invalid_rows" + "identity_conflict_rows" = "total_rows"
    )
  ),
  CONSTRAINT "listing_import_batches_completed_after_created" CHECK (
    "completed_at" >= "created_at"
    AND (
      "sealed_at" IS NULL
      OR "sealed_at" >= "completed_at"
    )
  )
);

CREATE TABLE "listing_import_idempotency_keys" (
  "credential_id" UUID NOT NULL,
  "idempotency_key_digest" CHAR(64) NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "batch_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_import_idempotency_keys_pkey" PRIMARY KEY (
    "credential_id", "idempotency_key_digest"
  ),
  CONSTRAINT "listing_import_idempotency_keys_digest_format" CHECK (
    "idempotency_key_digest" ~ '^[0-9a-f]{64}$'
    AND "request_digest" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE "listing_source_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id" UUID NOT NULL,
  "source_listing_id" VARCHAR(255) NOT NULL,
  "canonical_source_url" VARCHAR(2048) NOT NULL,
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_content_hash" CHAR(64) NOT NULL,
  "linked_event_id" UUID,
  "linked_external_listing_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "listing_source_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_source_records_identity_not_blank" CHECK (
    char_length(btrim("source_listing_id")) > 0
  ),
  CONSTRAINT "listing_source_records_https_url" CHECK (
    "canonical_source_url" ~ E'^https://[^/@?#]+(:[0-9]+)?(/|\\?|$)'
    AND position('#' IN "canonical_source_url") = 0
  ),
  CONSTRAINT "listing_source_records_hash_format" CHECK (
    "last_content_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "listing_source_records_seen_order" CHECK (
    "last_seen_at" >= "first_seen_at"
  ),
  CONSTRAINT "listing_source_records_link_target" CHECK (
    num_nonnulls("linked_event_id", "linked_external_listing_id") <= 1
  )
);

CREATE TABLE "listing_import_rows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "batch_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "source_record_id" UUID,
  "status" "listing_import_row_status" NOT NULL,
  "input_json" JSONB NOT NULL,
  "normalized_json" JSONB,
  "validation_failures" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "content_hash" CHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_import_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_import_rows_row_number" CHECK (
    "row_number" BETWEEN 1 AND 200
  ),
  CONSTRAINT "listing_import_rows_json_shapes" CHECK (
    ("normalized_json" IS NULL OR jsonb_typeof("normalized_json") = 'object')
    AND jsonb_typeof("validation_failures") = 'array'
  ),
  CONSTRAINT "listing_import_rows_json_sizes" CHECK (
    octet_length("input_json"::TEXT) <= 1048576
    AND (
      "normalized_json" IS NULL
      OR octet_length("normalized_json"::TEXT) <= 65536
    )
    AND octet_length("validation_failures"::TEXT) <= 8192
  ),
  CONSTRAINT "listing_import_rows_hash_format" CHECK (
    "content_hash" IS NULL OR "content_hash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "listing_import_rows_status_payload" CHECK (
    (
      "status" = 'INVALID'
      AND jsonb_array_length("validation_failures") > 0
    )
    OR (
      "status" <> 'INVALID'
      AND "normalized_json" IS NOT NULL
      AND "content_hash" IS NOT NULL
      AND jsonb_array_length("validation_failures") = 0
    )
  ),
  CONSTRAINT "listing_import_rows_source_record" CHECK (
    (
      "status" IN ('INVALID', 'IDENTITY_CONFLICT')
      AND "source_record_id" IS NULL
    )
    OR (
      "status" NOT IN ('INVALID', 'IDENTITY_CONFLICT')
      AND "source_record_id" IS NOT NULL
    )
  )
);

CREATE TABLE "listing_import_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_record_id" UUID NOT NULL,
  "creation_observation_id" UUID NOT NULL,
  "latest_observation_id" UUID NOT NULL,
  "current_payload" JSONB NOT NULL,
  "normalized_title" VARCHAR(120) NOT NULL,
  "normalized_address" VARCHAR(500),
  "normalized_city" VARCHAR(100) NOT NULL,
  "normalized_postal_code" VARCHAR(20),
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "latitude" DECIMAL(9, 6),
  "longitude" DECIMAL(9, 6),
  "coordinates" public.geography(Point, 4326),
  "location_provider_place_id" VARCHAR(255),
  "location_provider_name" VARCHAR(50),
  "location_provider_version" VARCHAR(50),
  "location_provider_attribution" VARCHAR(255),
  "location_resolution_source" "location_resolution_source" NOT NULL DEFAULT 'UNCONFIRMED_DRAFT',
  "location_confirmation_status" "location_confirmation_status" NOT NULL DEFAULT 'UNCONFIRMED',
  "location_confirmed_by_user_id" UUID,
  "location_confirmed_at" TIMESTAMPTZ(3),
  "status" "listing_import_candidate_status" NOT NULL DEFAULT 'PENDING_REVIEW',
  "version" INTEGER NOT NULL DEFAULT 1,
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "review_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "listing_import_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_import_candidates_payload_object" CHECK (
    jsonb_typeof("current_payload") = 'object'
    AND octet_length("current_payload"::TEXT) <= 65536
  ),
  CONSTRAINT "listing_import_candidates_normalized_fields" CHECK (
    char_length(btrim("normalized_title")) > 0
    AND char_length(btrim("normalized_city")) > 0
    AND (
      "normalized_address" IS NULL
      OR char_length(btrim("normalized_address")) > 0
    )
    AND (
      "normalized_postal_code" IS NULL
      OR char_length(btrim("normalized_postal_code")) > 0
    )
  ),
  CONSTRAINT "listing_import_candidates_schedule" CHECK (
    "ends_at" > "starts_at"
  ),
  CONSTRAINT "listing_import_candidates_version" CHECK (
    "version" >= 1
  ),
  CONSTRAINT "listing_import_candidates_coordinates" CHECK (
    (
      "latitude" IS NULL
      AND "longitude" IS NULL
      AND "coordinates" IS NULL
    )
    OR (
      "latitude" BETWEEN -90 AND 90
      AND "longitude" BETWEEN -180 AND 180
      AND "coordinates" IS NOT NULL
    )
  ),
  CONSTRAINT "listing_import_candidates_confirmation" CHECK (
    (
      "location_confirmation_status" = 'UNCONFIRMED'
      AND "location_confirmed_by_user_id" IS NULL
      AND "location_confirmed_at" IS NULL
    )
    OR (
      "location_confirmation_status" = 'CONFIRMED'
      AND "latitude" IS NOT NULL
      AND "longitude" IS NOT NULL
      AND "coordinates" IS NOT NULL
      AND "location_provider_place_id" IS NOT NULL
      AND "location_provider_name" IS NOT NULL
      AND "location_resolution_source" <> 'UNCONFIRMED_DRAFT'
      AND "location_confirmed_by_user_id" IS NOT NULL
      AND "location_confirmed_at" IS NOT NULL
    )
  ),
  CONSTRAINT "listing_import_candidates_review" CHECK (
    (
      "status" = 'PENDING_REVIEW'
      AND "reviewed_by_user_id" IS NULL
      AND "reviewed_at" IS NULL
      AND "review_reason" IS NULL
    )
    OR (
      "status" = 'APPROVED'
      AND "reviewed_by_user_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
      AND "review_reason" IS NULL
    )
    OR (
      "status" IN ('REJECTED', 'DUPLICATE_LINKED', 'DELETED')
      AND "reviewed_by_user_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
      AND "review_reason" IS NOT NULL
      AND char_length(btrim("review_reason")) > 0
    )
  )
);

CREATE TABLE "external_listings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidate_id" UUID NOT NULL,
  "primary_source_record_id" UUID NOT NULL,
  "public_id" VARCHAR(12) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "canonical_path" VARCHAR(255) NOT NULL,
  "event_type" "event_type" NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" VARCHAR(5000) NOT NULL,
  "local_starts_at" VARCHAR(16) NOT NULL,
  "local_ends_at" VARCHAR(16) NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "privacy_mode" "address_privacy_mode" NOT NULL,
  "status" "external_listing_status" NOT NULL DEFAULT 'PUBLISHED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "attribution" JSONB NOT NULL,
  "published_at" TIMESTAMPTZ(3) NOT NULL,
  "expired_at" TIMESTAMPTZ(3),
  "removed_at" TIMESTAMPTZ(3),
  "removal_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "external_listings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_listings_public_id" CHECK (
    "public_id" ~ '^[0-9a-f]{12}$'
  ),
  CONSTRAINT "external_listings_slug" CHECK (
    "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT "external_listings_canonical_path" CHECK (
    "canonical_path" ~ '^/(estate-sales|yard-sales)/[a-z0-9-]+-[0-9a-f]{12}$'
    AND right("canonical_path", 12) = "public_id"
    AND (
      ("event_type" = 'ESTATE_SALE' AND "canonical_path" LIKE '/estate-sales/%')
      OR ("event_type" = 'YARD_SALE' AND "canonical_path" LIKE '/yard-sales/%')
    )
  ),
  CONSTRAINT "external_listings_content" CHECK (
    char_length(btrim("title")) >= 3
    AND char_length(btrim("description")) >= 20
    AND char_length(btrim("timezone")) > 0
  ),
  CONSTRAINT "external_listings_schedule" CHECK (
    "ends_at" > "starts_at"
  ),
  CONSTRAINT "external_listings_version" CHECK (
    "version" >= 1
  ),
  CONSTRAINT "external_listings_attribution_object" CHECK (
    jsonb_typeof("attribution") = 'object'
    AND octet_length("attribution"::TEXT) <= 8192
  ),
  CONSTRAINT "external_listings_lifecycle" CHECK (
    (
      "status" = 'PUBLISHED'
      AND "published_at" IS NOT NULL
      AND "expired_at" IS NULL
      AND "removed_at" IS NULL
      AND "removal_reason" IS NULL
    )
    OR (
      "status" = 'EXPIRED'
      AND "published_at" IS NOT NULL
      AND "expired_at" IS NOT NULL
      AND "expired_at" >= "published_at"
      AND "removed_at" IS NULL
      AND "removal_reason" IS NULL
    )
    OR (
      "status" = 'REMOVED'
      AND "published_at" IS NOT NULL
      AND "expired_at" IS NULL
      AND "removed_at" IS NOT NULL
      AND "removed_at" >= "published_at"
      AND "removal_reason" IS NOT NULL
      AND char_length(btrim("removal_reason")) > 0
    )
  )
);

CREATE TABLE "listing_public_id_reservations" (
  "public_id" VARCHAR(12) NOT NULL,
  "event_id" UUID,
  "external_listing_id" UUID,
  "reserved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_public_id_reservations_pkey" PRIMARY KEY ("public_id"),
  CONSTRAINT "listing_public_id_reservations_owner" CHECK (
    num_nonnulls("event_id", "external_listing_id") = 1
  )
);

CREATE TABLE "external_listing_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id" UUID NOT NULL,
  "address_line_1" VARCHAR(200) NOT NULL,
  "address_line_2" VARCHAR(100),
  "city" VARCHAR(100) NOT NULL,
  "region" VARCHAR(100) NOT NULL,
  "postal_code" VARCHAR(20) NOT NULL,
  "country_code" CHAR(2) NOT NULL,
  "normalized_address" VARCHAR(500) NOT NULL,
  "latitude" DECIMAL(9, 6),
  "longitude" DECIMAL(9, 6),
  "coordinates" public.geography(Point, 4326),
  "timezone" VARCHAR(64) NOT NULL,
  "provider_place_id" VARCHAR(255),
  "provider_name" VARCHAR(50),
  "provider_version" VARCHAR(50),
  "provider_attribution" VARCHAR(255),
  "resolution_source" "location_resolution_source" NOT NULL DEFAULT 'UNCONFIRMED_DRAFT',
  "confirmation_status" "location_confirmation_status" NOT NULL DEFAULT 'UNCONFIRMED',
  "confirmed_by_user_id" UUID,
  "confirmed_at" TIMESTAMPTZ(3),
  "public_zone" VARCHAR(50) NOT NULL DEFAULT 'bakersfield',
  "precision" VARCHAR(50),
  "confidence" DECIMAL(5, 4),
  "validation_status" "location_validation_status" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "external_listing_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_listing_locations_address" CHECK (
    char_length(btrim("address_line_1")) > 0
    AND char_length(btrim("city")) > 0
    AND char_length(btrim("region")) > 0
    AND char_length(btrim("postal_code")) > 0
    AND char_length(btrim("normalized_address")) > 0
    AND char_length(btrim("timezone")) > 0
    AND char_length(btrim("public_zone")) > 0
  ),
  CONSTRAINT "external_listing_locations_country_code" CHECK (
    "country_code" ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT "external_listing_locations_coordinates" CHECK (
    (
      "latitude" IS NULL
      AND "longitude" IS NULL
      AND "coordinates" IS NULL
    )
    OR (
      "latitude" BETWEEN -90 AND 90
      AND "longitude" BETWEEN -180 AND 180
      AND "coordinates" IS NOT NULL
    )
  ),
  CONSTRAINT "external_listing_locations_confirmation" CHECK (
    (
      "confirmation_status" = 'UNCONFIRMED'
      AND "confirmed_by_user_id" IS NULL
      AND "confirmed_at" IS NULL
    )
    OR (
      "confirmation_status" = 'CONFIRMED'
      AND "latitude" IS NOT NULL
      AND "longitude" IS NOT NULL
      AND "coordinates" IS NOT NULL
      AND "provider_place_id" IS NOT NULL
      AND "provider_name" IS NOT NULL
      AND "resolution_source" <> 'UNCONFIRMED_DRAFT'
      AND "confirmed_by_user_id" IS NOT NULL
      AND "confirmed_at" IS NOT NULL
    )
  ),
  CONSTRAINT "external_listing_locations_confidence" CHECK (
    "confidence" IS NULL OR "confidence" BETWEEN 0 AND 1
  )
);

CREATE TABLE "listing_duplicate_matches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidate_id" UUID NOT NULL,
  "event_id" UUID,
  "external_listing_id" UUID,
  "reasons" JSONB NOT NULL,
  "resolution" "listing_duplicate_resolution" NOT NULL DEFAULT 'UNRESOLVED',
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "listing_duplicate_matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_duplicate_matches_target" CHECK (
    num_nonnulls("event_id", "external_listing_id") = 1
  ),
  CONSTRAINT "listing_duplicate_matches_reasons" CHECK (
    jsonb_typeof("reasons") = 'array'
    AND jsonb_array_length("reasons") > 0
    AND octet_length("reasons"::TEXT) <= 8192
  ),
  CONSTRAINT "listing_duplicate_matches_resolution" CHECK (
    (
      "resolution" = 'UNRESOLVED'
      AND "resolved_by_user_id" IS NULL
      AND "resolved_at" IS NULL
    )
    OR (
      "resolution" IN ('NOT_DUPLICATE', 'LINKED')
      AND "resolved_by_user_id" IS NOT NULL
      AND "resolved_at" IS NOT NULL
      AND "resolved_at" >= "created_at"
    )
  )
);

CREATE UNIQUE INDEX "listing_import_sources_key_key"
  ON "listing_import_sources"("key");
CREATE INDEX "listing_import_sources_enabled_production_allowed_idx"
  ON "listing_import_sources"("enabled", "production_allowed");

CREATE UNIQUE INDEX "listing_ingestion_credentials_token_digest_key"
  ON "listing_ingestion_credentials"("token_digest");
CREATE INDEX "listing_ingestion_credentials_source_id_revoked_at_idx"
  ON "listing_ingestion_credentials"("source_id", "revoked_at");
CREATE INDEX "listing_ingestion_credentials_created_by_user_id_created_at_idx"
  ON "listing_ingestion_credentials"("created_by_user_id", "created_at");

CREATE UNIQUE INDEX "listing_import_batches_source_id_ingestor_instance_id_inges_key"
  ON "listing_import_batches"(
    "source_id", "ingestor_instance_id", "ingestor_run_id"
  );
CREATE INDEX "listing_import_batches_source_id_created_at_idx"
  ON "listing_import_batches"("source_id", "created_at");
CREATE INDEX "listing_import_batches_status_created_at_idx"
  ON "listing_import_batches"("status", "created_at");
CREATE INDEX "listing_import_batches_admin_actor_user_id_created_at_idx"
  ON "listing_import_batches"("admin_actor_user_id", "created_at");

CREATE INDEX "listing_import_idempotency_keys_batch_id_idx"
  ON "listing_import_idempotency_keys"("batch_id");

CREATE UNIQUE INDEX "listing_source_records_source_id_source_listing_id_key"
  ON "listing_source_records"("source_id", "source_listing_id");
CREATE UNIQUE INDEX "listing_source_records_source_id_canonical_source_url_key"
  ON "listing_source_records"("source_id", "canonical_source_url");
CREATE INDEX "listing_source_records_source_id_last_seen_at_idx"
  ON "listing_source_records"("source_id", "last_seen_at");
CREATE INDEX "listing_source_records_linked_event_id_idx"
  ON "listing_source_records"("linked_event_id");
CREATE INDEX "listing_source_records_linked_external_listing_id_idx"
  ON "listing_source_records"("linked_external_listing_id");

CREATE UNIQUE INDEX "listing_import_rows_batch_id_row_number_key"
  ON "listing_import_rows"("batch_id", "row_number");
CREATE INDEX "listing_import_rows_batch_id_status_idx"
  ON "listing_import_rows"("batch_id", "status");
CREATE INDEX "listing_import_rows_source_record_id_created_at_idx"
  ON "listing_import_rows"("source_record_id", "created_at");

CREATE UNIQUE INDEX "listing_import_candidates_source_record_id_key"
  ON "listing_import_candidates"("source_record_id");
CREATE UNIQUE INDEX "listing_import_candidates_creation_observation_id_key"
  ON "listing_import_candidates"("creation_observation_id");
CREATE UNIQUE INDEX "listing_import_candidates_latest_observation_id_key"
  ON "listing_import_candidates"("latest_observation_id");
CREATE INDEX "listing_import_candidates_status_starts_at_id_idx"
  ON "listing_import_candidates"("status", "starts_at", "id");
CREATE INDEX "listing_import_candidates_normalized_city_starts_at_idx"
  ON "listing_import_candidates"("normalized_city", "starts_at");
CREATE INDEX "listing_import_candidates_normalized_address_starts_at_idx"
  ON "listing_import_candidates"("normalized_address", "starts_at")
  WHERE "normalized_address" IS NOT NULL;
CREATE INDEX "listing_import_candidates_normalized_postal_code_starts_at_idx"
  ON "listing_import_candidates"("normalized_postal_code", "starts_at")
  WHERE "normalized_postal_code" IS NOT NULL;
CREATE INDEX "listing_import_candidates_location_confirmation_status_stat_idx"
  ON "listing_import_candidates"("location_confirmation_status", "status");
CREATE INDEX "listing_import_candidates_coordinates_gist_idx"
  ON "listing_import_candidates" USING GIST ("coordinates")
  WHERE "coordinates" IS NOT NULL;

CREATE UNIQUE INDEX "external_listings_candidate_id_key"
  ON "external_listings"("candidate_id");
CREATE UNIQUE INDEX "external_listings_primary_source_record_id_key"
  ON "external_listings"("primary_source_record_id");
CREATE UNIQUE INDEX "external_listings_public_id_key"
  ON "external_listings"("public_id");
CREATE UNIQUE INDEX "external_listings_canonical_path_key"
  ON "external_listings"("canonical_path");
CREATE INDEX "external_listings_status_starts_at_public_id_idx"
  ON "external_listings"("status", "starts_at", "public_id");
CREATE INDEX "external_listings_status_ends_at_idx"
  ON "external_listings"("status", "ends_at");
CREATE INDEX "external_listings_event_type_status_starts_at_idx"
  ON "external_listings"("event_type", "status", "starts_at");
CREATE INDEX "external_listings_starts_at_ends_at_id_idx"
  ON "external_listings"("starts_at", "ends_at", "id");

CREATE UNIQUE INDEX "listing_public_id_reservations_event_id_key"
  ON "listing_public_id_reservations"("event_id");
CREATE UNIQUE INDEX "listing_public_id_reservations_external_listing_id_key"
  ON "listing_public_id_reservations"("external_listing_id");

CREATE INDEX "events_starts_at_ends_at_id_idx"
  ON "events"("starts_at", "ends_at", "id");

CREATE UNIQUE INDEX "external_listing_locations_listing_id_key"
  ON "external_listing_locations"("listing_id");
CREATE INDEX "external_listing_locations_city_region_idx"
  ON "external_listing_locations"("city", "region");
CREATE INDEX "external_listing_locations_validation_status_idx"
  ON "external_listing_locations"("validation_status");
CREATE INDEX "external_listing_locations_confirmation_status_idx"
  ON "external_listing_locations"("confirmation_status");
CREATE INDEX "external_listing_locations_coordinates_gist_idx"
  ON "external_listing_locations" USING GIST ("coordinates")
  WHERE "coordinates" IS NOT NULL;

CREATE UNIQUE INDEX "listing_duplicate_matches_candidate_event_target_key"
  ON "listing_duplicate_matches"("candidate_id", "event_id")
  WHERE "event_id" IS NOT NULL;
CREATE UNIQUE INDEX "listing_duplicate_matches_candidate_external_target_key"
  ON "listing_duplicate_matches"("candidate_id", "external_listing_id")
  WHERE "external_listing_id" IS NOT NULL;
CREATE INDEX "listing_duplicate_matches_candidate_id_resolution_idx"
  ON "listing_duplicate_matches"("candidate_id", "resolution");
CREATE INDEX "listing_duplicate_matches_event_id_idx"
  ON "listing_duplicate_matches"("event_id");
CREATE INDEX "listing_duplicate_matches_external_listing_id_idx"
  ON "listing_duplicate_matches"("external_listing_id");
CREATE INDEX "listing_duplicate_matches_resolved_by_user_id_resolved_at_idx"
  ON "listing_duplicate_matches"("resolved_by_user_id", "resolved_at");

ALTER TABLE "listing_ingestion_credentials"
ADD CONSTRAINT "listing_ingestion_credentials_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "listing_import_sources"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_ingestion_credentials"
ADD CONSTRAINT "listing_ingestion_credentials_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_batches"
ADD CONSTRAINT "listing_import_batches_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "listing_import_sources"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_batches"
ADD CONSTRAINT "listing_import_batches_credential_id_fkey"
FOREIGN KEY ("credential_id") REFERENCES "listing_ingestion_credentials"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_batches"
ADD CONSTRAINT "listing_import_batches_admin_actor_user_id_fkey"
FOREIGN KEY ("admin_actor_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_idempotency_keys"
ADD CONSTRAINT "listing_import_idempotency_keys_credential_id_fkey"
FOREIGN KEY ("credential_id") REFERENCES "listing_ingestion_credentials"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_idempotency_keys"
ADD CONSTRAINT "listing_import_idempotency_keys_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "listing_import_batches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_source_records"
ADD CONSTRAINT "listing_source_records_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "listing_import_sources"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_source_records"
ADD CONSTRAINT "listing_source_records_linked_event_id_fkey"
FOREIGN KEY ("linked_event_id") REFERENCES "events"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_source_records"
ADD CONSTRAINT "listing_source_records_linked_external_listing_id_fkey"
FOREIGN KEY ("linked_external_listing_id") REFERENCES "external_listings"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_rows"
ADD CONSTRAINT "listing_import_rows_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "listing_import_batches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_rows"
ADD CONSTRAINT "listing_import_rows_source_record_id_fkey"
FOREIGN KEY ("source_record_id") REFERENCES "listing_source_records"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_candidates"
ADD CONSTRAINT "listing_import_candidates_source_record_id_fkey"
FOREIGN KEY ("source_record_id") REFERENCES "listing_source_records"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_candidates"
ADD CONSTRAINT "listing_import_candidates_creation_observation_id_fkey"
FOREIGN KEY ("creation_observation_id") REFERENCES "listing_import_rows"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_candidates"
ADD CONSTRAINT "listing_import_candidates_latest_observation_id_fkey"
FOREIGN KEY ("latest_observation_id") REFERENCES "listing_import_rows"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_candidates"
ADD CONSTRAINT "listing_import_candidates_location_confirmed_by_user_id_fkey"
FOREIGN KEY ("location_confirmed_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_import_candidates"
ADD CONSTRAINT "listing_import_candidates_reviewed_by_user_id_fkey"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_listings"
ADD CONSTRAINT "external_listings_candidate_id_fkey"
FOREIGN KEY ("candidate_id") REFERENCES "listing_import_candidates"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_listings"
ADD CONSTRAINT "external_listings_primary_source_record_id_fkey"
FOREIGN KEY ("primary_source_record_id") REFERENCES "listing_source_records"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_public_id_reservations"
ADD CONSTRAINT "listing_public_id_reservations_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_public_id_reservations"
ADD CONSTRAINT "listing_public_id_reservations_external_listing_id_fkey"
FOREIGN KEY ("external_listing_id") REFERENCES "external_listings"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_listing_locations"
ADD CONSTRAINT "external_listing_locations_listing_id_fkey"
FOREIGN KEY ("listing_id") REFERENCES "external_listings"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_listing_locations"
ADD CONSTRAINT "external_listing_locations_confirmed_by_user_id_fkey"
FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_duplicate_matches"
ADD CONSTRAINT "listing_duplicate_matches_candidate_id_fkey"
FOREIGN KEY ("candidate_id") REFERENCES "listing_import_candidates"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_duplicate_matches"
ADD CONSTRAINT "listing_duplicate_matches_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_duplicate_matches"
ADD CONSTRAINT "listing_duplicate_matches_external_listing_id_fkey"
FOREIGN KEY ("external_listing_id") REFERENCES "external_listings"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "listing_duplicate_matches"
ADD CONSTRAINT "listing_duplicate_matches_resolved_by_user_id_fkey"
FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "listing_public_id_reservations" (
  "public_id",
  "event_id"
)
SELECT
  event."public_id",
  event."id"
FROM "events" event;

CREATE OR REPLACE FUNCTION reserve_listing_public_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    INSERT INTO "listing_public_id_reservations" (
      "public_id",
      "event_id"
    ) VALUES (
      NEW."public_id",
      NEW."id"
    );
  ELSE
    INSERT INTO "listing_public_id_reservations" (
      "public_id",
      "external_listing_id"
    ) VALUES (
      NEW."public_id",
      NEW."id"
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER events_reserve_listing_public_id
AFTER INSERT ON "events"
FOR EACH ROW EXECUTE FUNCTION reserve_listing_public_id();

CREATE OR REPLACE FUNCTION protect_event_listing_public_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."public_id" IS DISTINCT FROM OLD."public_id" THEN
    RAISE EXCEPTION 'event listing public ID is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER events_listing_public_id_immutable
BEFORE UPDATE OF "public_id" ON "events"
FOR EACH ROW EXECUTE FUNCTION protect_event_listing_public_id();

CREATE TRIGGER external_listings_reserve_listing_public_id
AFTER INSERT ON "external_listings"
FOR EACH ROW EXECUTE FUNCTION reserve_listing_public_id();

CREATE OR REPLACE FUNCTION protect_listing_public_id_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'listing public ID reservations are immutable';
END;
$$;

CREATE TRIGGER listing_public_id_reservations_immutable
BEFORE UPDATE OR DELETE ON "listing_public_id_reservations"
FOR EACH ROW EXECUTE FUNCTION protect_listing_public_id_reservation();

CREATE OR REPLACE FUNCTION enforce_listing_import_source_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  host_value TEXT;
  parameter_value TEXT;
BEGIN
  FOREACH host_value IN ARRAY NEW."allowed_hosts"
  LOOP
    IF host_value <> lower(host_value)
      OR host_value <> btrim(host_value)
      OR host_value !~ '^[a-z0-9.-]+$'
      OR host_value LIKE '.%'
      OR host_value LIKE '%.'
      OR host_value LIKE '%..%'
    THEN
      RAISE EXCEPTION 'listing import source hosts must be normalized host names';
    END IF;
  END LOOP;

  IF (
    SELECT count(*) <> count(DISTINCT allowed_host.value)
    FROM unnest(NEW."allowed_hosts") AS allowed_host(value)
  ) THEN
    RAISE EXCEPTION 'listing import source hosts must be unique';
  END IF;

  FOREACH parameter_value IN ARRAY NEW."allowed_query_parameters"
  LOOP
    IF parameter_value <> btrim(parameter_value)
      OR parameter_value !~ '^[A-Za-z0-9._~-]+$'
    THEN
      RAISE EXCEPTION 'listing import source query parameters are invalid';
    END IF;
  END LOOP;

  IF (
    SELECT count(*) <> count(DISTINCT allowed_parameter.value)
    FROM unnest(NEW."allowed_query_parameters")
      AS allowed_parameter(value)
  ) THEN
    RAISE EXCEPTION 'listing import source query parameters must be unique';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_import_sources_policy
BEFORE INSERT OR UPDATE OF "allowed_hosts", "allowed_query_parameters"
ON "listing_import_sources"
FOR EACH ROW EXECUTE FUNCTION enforce_listing_import_source_policy();

CREATE OR REPLACE FUNCTION protect_listing_import_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'listing import sources cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."key" IS DISTINCT FROM OLD."key"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'listing import source identity is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_import_sources_protected
BEFORE UPDATE OR DELETE ON "listing_import_sources"
FOR EACH ROW EXECUTE FUNCTION protect_listing_import_source();

CREATE OR REPLACE FUNCTION protect_listing_ingestion_credential()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'listing ingestion credentials cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
    OR NEW."token_digest" IS DISTINCT FROM OLD."token_digest"
    OR NEW."display_prefix" IS DISTINCT FROM OLD."display_prefix"
    OR NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'listing ingestion credential identity is immutable';
  END IF;

  IF OLD."revoked_at" IS NOT NULL
    AND NEW."revoked_at" IS DISTINCT FROM OLD."revoked_at"
  THEN
    RAISE EXCEPTION 'listing ingestion credential revocation is terminal';
  END IF;

  IF OLD."last_used_at" IS NOT NULL
    AND (
      NEW."last_used_at" IS NULL
      OR NEW."last_used_at" < OLD."last_used_at"
    )
  THEN
    RAISE EXCEPTION 'listing ingestion credential usage time cannot move backwards';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_ingestion_credentials_protected
BEFORE UPDATE OR DELETE ON "listing_ingestion_credentials"
FOR EACH ROW EXECUTE FUNCTION protect_listing_ingestion_credential();

CREATE OR REPLACE FUNCTION enforce_listing_import_batch_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "listing_import_sources" source
    WHERE source."id" = NEW."source_id"
      AND source."enabled" = true
  ) THEN
    RAISE EXCEPTION 'listing import batch requires an enabled source';
  END IF;

  IF NEW."transport" = 'API' AND NOT EXISTS (
    SELECT 1
    FROM "listing_ingestion_credentials" credential
    WHERE credential."id" = NEW."credential_id"
      AND credential."source_id" = NEW."source_id"
      AND credential."revoked_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'listing import batch credential does not match its source';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_import_batches_actor_correlation
BEFORE INSERT ON "listing_import_batches"
FOR EACH ROW EXECUTE FUNCTION enforce_listing_import_batch_actor();

CREATE OR REPLACE FUNCTION prevent_listing_import_batch_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'listing import batches are immutable';
  END IF;

  IF OLD."sealed_at" IS NOT NULL
    OR NEW."sealed_at" IS NULL
    OR (to_jsonb(NEW) - 'sealed_at')
      IS DISTINCT FROM (to_jsonb(OLD) - 'sealed_at')
  THEN
    RAISE EXCEPTION 'listing import batches are immutable after one-time sealing';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_import_batches_immutable
BEFORE UPDATE OR DELETE ON "listing_import_batches"
FOR EACH ROW EXECUTE FUNCTION prevent_listing_import_batch_mutation();

CREATE OR REPLACE FUNCTION enforce_listing_import_batch_row_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_record "listing_import_batches"%ROWTYPE;
  observed_total INTEGER;
  observed_candidates INTEGER;
  observed_invalid INTEGER;
  observed_exact_duplicates INTEGER;
  observed_source_changes INTEGER;
  observed_identity_conflicts INTEGER;
  observed_minimum_row INTEGER;
  observed_maximum_row INTEGER;
BEGIN
  SELECT *
  INTO batch_record
  FROM "listing_import_batches"
  WHERE "id" = NEW."id";

  IF batch_record."sealed_at" IS NULL THEN
    RAISE EXCEPTION 'listing import batch must be sealed before commit';
  END IF;

  IF batch_record."transport" = 'API'
    AND NOT EXISTS (
      SELECT 1
      FROM "listing_import_idempotency_keys" idempotency_key
      WHERE idempotency_key."batch_id" = batch_record."id"
        AND idempotency_key."credential_id" = batch_record."credential_id"
    )
  THEN
    RAISE EXCEPTION 'API listing import batch requires an idempotency binding';
  END IF;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE "status" = 'CANDIDATE_CREATED')::INTEGER,
    count(*) FILTER (WHERE "status" = 'INVALID')::INTEGER,
    count(*) FILTER (WHERE "status" = 'EXACT_DUPLICATE')::INTEGER,
    count(*) FILTER (WHERE "status" = 'SOURCE_CHANGED')::INTEGER,
    count(*) FILTER (WHERE "status" = 'IDENTITY_CONFLICT')::INTEGER,
    min("row_number")::INTEGER,
    max("row_number")::INTEGER
  INTO
    observed_total,
    observed_candidates,
    observed_invalid,
    observed_exact_duplicates,
    observed_source_changes,
    observed_identity_conflicts,
    observed_minimum_row,
    observed_maximum_row
  FROM "listing_import_rows"
  WHERE "batch_id" = NEW."id";

  IF observed_total <> batch_record."total_rows"
    OR observed_candidates <> batch_record."candidate_rows"
    OR observed_invalid <> batch_record."invalid_rows"
    OR observed_exact_duplicates <> batch_record."exact_duplicate_rows"
    OR observed_source_changes <> batch_record."source_changed_rows"
    OR observed_identity_conflicts <> batch_record."identity_conflict_rows"
    OR observed_minimum_row <> 1
    OR observed_maximum_row <> batch_record."total_rows"
  THEN
    RAISE EXCEPTION 'listing import batch counts do not match immutable rows';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER listing_import_batches_row_counts
AFTER INSERT ON "listing_import_batches"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_listing_import_batch_row_counts();

CREATE OR REPLACE FUNCTION enforce_listing_import_idempotency_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "listing_ingestion_credentials" credential
    JOIN "listing_import_batches" batch
      ON batch."id" = NEW."batch_id"
      AND batch."source_id" = credential."source_id"
    WHERE credential."id" = NEW."credential_id"
      AND credential."revoked_at" IS NULL
      AND batch."sealed_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'listing import idempotency binding source does not match its batch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER listing_import_idempotency_keys_correlation
AFTER INSERT ON "listing_import_idempotency_keys"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_listing_import_idempotency_key();

CREATE OR REPLACE FUNCTION protect_listing_import_idempotency_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'listing import idempotency bindings are immutable';
END;
$$;

CREATE TRIGGER listing_import_idempotency_keys_immutable
BEFORE UPDATE OR DELETE ON "listing_import_idempotency_keys"
FOR EACH ROW EXECUTE FUNCTION protect_listing_import_idempotency_key();

CREATE OR REPLACE FUNCTION protect_listing_source_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'listing source records cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
    OR NEW."source_listing_id" IS DISTINCT FROM OLD."source_listing_id"
    OR NEW."first_seen_at" IS DISTINCT FROM OLD."first_seen_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'listing source record identity is immutable';
  END IF;

  IF NEW."last_seen_at" < OLD."last_seen_at" THEN
    RAISE EXCEPTION 'listing source record last-seen time cannot move backwards';
  END IF;

  IF OLD."linked_event_id" IS NOT NULL
    AND NEW."linked_event_id" IS DISTINCT FROM OLD."linked_event_id"
  THEN
    RAISE EXCEPTION 'listing source record event link is terminal';
  END IF;

  IF OLD."linked_external_listing_id" IS NOT NULL
    AND NEW."linked_external_listing_id"
      IS DISTINCT FROM OLD."linked_external_listing_id"
  THEN
    RAISE EXCEPTION 'listing source record external link is terminal';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_source_records_protected
BEFORE UPDATE OR DELETE ON "listing_source_records"
FOR EACH ROW EXECUTE FUNCTION protect_listing_source_record();

CREATE OR REPLACE FUNCTION enforce_listing_source_record_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF num_nonnulls(NEW."linked_event_id", NEW."linked_external_listing_id") > 0
    AND EXISTS (
      SELECT 1
      FROM "external_listings" listing
      WHERE listing."primary_source_record_id" = NEW."id"
    )
  THEN
    RAISE EXCEPTION 'published primary source linkage is immutable';
  END IF;

  IF NEW."linked_event_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "event_publications" publication
    JOIN "events" event ON event."id" = publication."event_id"
    WHERE publication."event_id" = NEW."linked_event_id"
      AND event."deleted_at" IS NULL
      AND event."canceled_at" IS NULL
      AND event."removed_at" IS NULL
      AND (
        publication."snapshot" -> 'projection' ->> 'endsAt'
      )::TIMESTAMPTZ > CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'listing source records can link only to active published events';
  END IF;

  IF NEW."linked_external_listing_id" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "external_listings" listing
      WHERE listing."id" = NEW."linked_external_listing_id"
        AND listing."status" = 'PUBLISHED'
        AND listing."ends_at" > CURRENT_TIMESTAMP
    ) THEN
      RAISE EXCEPTION 'listing source records can link only to published external listings';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "external_listings" listing
      WHERE listing."id" = NEW."linked_external_listing_id"
        AND listing."primary_source_record_id" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'listing source records cannot duplicate-link to their own listing';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_source_records_link_correlation
BEFORE INSERT OR UPDATE OF "linked_event_id", "linked_external_listing_id"
ON "listing_source_records"
FOR EACH ROW EXECUTE FUNCTION enforce_listing_source_record_link();

CREATE OR REPLACE FUNCTION prevent_listing_import_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'listing import rows are immutable';
END;
$$;

CREATE TRIGGER listing_import_rows_immutable
BEFORE UPDATE OR DELETE ON "listing_import_rows"
FOR EACH ROW EXECUTE FUNCTION prevent_listing_import_row_mutation();

CREATE OR REPLACE FUNCTION enforce_listing_import_row_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "listing_import_batches" batch
    WHERE batch."id" = NEW."batch_id"
      AND batch."sealed_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'listing import rows require an unsealed batch';
  END IF;

  IF NEW."source_record_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "listing_import_batches" batch
    JOIN "listing_source_records" source_record
      ON source_record."source_id" = batch."source_id"
    WHERE batch."id" = NEW."batch_id"
      AND source_record."id" = NEW."source_record_id"
  ) THEN
    RAISE EXCEPTION 'listing import row source does not match its batch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_import_rows_source_correlation
BEFORE INSERT ON "listing_import_rows"
FOR EACH ROW EXECUTE FUNCTION enforce_listing_import_row_source();

CREATE OR REPLACE FUNCTION enforce_listing_import_row_candidate_result()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  created_candidate_count INTEGER;
BEGIN
  SELECT count(*)::INTEGER
  INTO created_candidate_count
  FROM "listing_import_candidates" candidate
  WHERE candidate."creation_observation_id" = NEW."id";

  IF (
    NEW."status" = 'CANDIDATE_CREATED'
    AND created_candidate_count <> 1
  ) OR (
    NEW."status" <> 'CANDIDATE_CREATED'
    AND created_candidate_count <> 0
  ) THEN
    RAISE EXCEPTION 'listing import row candidate result does not match its status';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER listing_import_rows_candidate_result
AFTER INSERT ON "listing_import_rows"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_listing_import_row_candidate_result();

CREATE OR REPLACE FUNCTION enforce_listing_import_candidate_correlation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "listing_import_rows" observation
    WHERE observation."id" = NEW."creation_observation_id"
      AND observation."source_record_id" = NEW."source_record_id"
      AND observation."status" = 'CANDIDATE_CREATED'
  ) THEN
    RAISE EXCEPTION 'listing import candidate creation observation does not match its source';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "listing_import_rows" observation
    WHERE observation."id" = NEW."latest_observation_id"
      AND observation."source_record_id" = NEW."source_record_id"
      AND observation."status" IN (
        'CANDIDATE_CREATED',
        'EXACT_DUPLICATE',
        'SOURCE_CHANGED'
      )
  ) THEN
    RAISE EXCEPTION 'listing import candidate observation does not match its source';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_import_candidates_correlation
BEFORE INSERT OR UPDATE OF
  "source_record_id", "creation_observation_id", "latest_observation_id"
ON "listing_import_candidates"
FOR EACH ROW EXECUTE FUNCTION enforce_listing_import_candidate_correlation();

CREATE OR REPLACE FUNCTION protect_listing_import_candidate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'listing import candidates use soft deletion';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."source_record_id" IS DISTINCT FROM OLD."source_record_id"
    OR NEW."creation_observation_id"
      IS DISTINCT FROM OLD."creation_observation_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'listing import candidate source identity is immutable';
  END IF;

  IF OLD."status" <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'reviewed listing import candidates are terminal';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'listing import candidate updates must increment version once';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_import_candidates_protected
BEFORE UPDATE OR DELETE ON "listing_import_candidates"
FOR EACH ROW EXECUTE FUNCTION protect_listing_import_candidate();

CREATE OR REPLACE FUNCTION enforce_external_listing_correlation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "listing_import_candidates" candidate
  WHERE candidate."id" = NEW."candidate_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'external listing candidate does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "listing_import_candidates" candidate
    JOIN "listing_source_records" source_record
      ON source_record."id" = candidate."source_record_id"
    WHERE candidate."id" = NEW."candidate_id"
      AND candidate."source_record_id" = NEW."primary_source_record_id"
      AND candidate."status" = 'APPROVED'
      AND candidate."location_confirmation_status" = 'CONFIRMED'
      AND source_record."linked_event_id" IS NULL
      AND source_record."linked_external_listing_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'external listing candidate and source identity do not match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "listing_duplicate_matches" duplicate_match
    WHERE duplicate_match."candidate_id" = NEW."candidate_id"
      AND duplicate_match."resolution" = 'UNRESOLVED'
  ) THEN
    RAISE EXCEPTION 'external listing candidate has unresolved duplicate matches';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER external_listings_correlation
BEFORE INSERT ON "external_listings"
FOR EACH ROW EXECUTE FUNCTION enforce_external_listing_correlation();

CREATE OR REPLACE FUNCTION enforce_external_listing_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "external_listing_locations" location
    WHERE location."listing_id" = NEW."id"
      AND location."confirmation_status" = 'CONFIRMED'
  ) THEN
    RAISE EXCEPTION 'external listing requires a confirmed location';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER external_listings_location_required
AFTER INSERT ON "external_listings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_external_listing_location();

CREATE OR REPLACE FUNCTION protect_external_listing()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'external listings cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."candidate_id" IS DISTINCT FROM OLD."candidate_id"
    OR NEW."primary_source_record_id"
      IS DISTINCT FROM OLD."primary_source_record_id"
    OR NEW."public_id" IS DISTINCT FROM OLD."public_id"
    OR NEW."attribution" IS DISTINCT FROM OLD."attribution"
    OR NEW."published_at" IS DISTINCT FROM OLD."published_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'external listing publication identity is immutable';
  END IF;

  IF OLD."status" <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'expired or removed external listings are terminal';
  END IF;

  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'external listing updates must increment version once';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER external_listings_protected
BEFORE UPDATE OR DELETE ON "external_listings"
FOR EACH ROW EXECUTE FUNCTION protect_external_listing();

CREATE OR REPLACE FUNCTION protect_external_listing_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'external listing locations cannot be deleted';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."listing_id" IS DISTINCT FROM OLD."listing_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'external listing location identity is immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "external_listings" listing
    WHERE listing."id" = NEW."listing_id"
      AND listing."status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'only published external listing locations can be edited';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER external_listing_locations_protected
BEFORE UPDATE OR DELETE ON "external_listing_locations"
FOR EACH ROW EXECUTE FUNCTION protect_external_listing_location();

CREATE OR REPLACE FUNCTION enforce_external_listing_location_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."confirmation_status" <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'external listing locations must remain confirmed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER external_listing_locations_ready
BEFORE INSERT OR UPDATE ON "external_listing_locations"
FOR EACH ROW EXECUTE FUNCTION enforce_external_listing_location_ready();

CREATE OR REPLACE FUNCTION enforce_listing_duplicate_match_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM "listing_import_candidates" candidate
  WHERE candidate."id" = NEW."candidate_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing duplicate match candidate does not exist';
  END IF;

  IF NEW."resolution" = 'UNRESOLVED'
    AND EXISTS (
      SELECT 1
      FROM "external_listings" listing
      WHERE listing."candidate_id" = NEW."candidate_id"
    )
  THEN
    RAISE EXCEPTION 'published external listings cannot gain unresolved duplicates';
  END IF;

  IF NEW."resolution" = 'LINKED'
    AND NEW."event_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "event_publications" publication
      JOIN "events" event ON event."id" = publication."event_id"
      WHERE publication."event_id" = NEW."event_id"
        AND event."deleted_at" IS NULL
        AND event."canceled_at" IS NULL
        AND event."removed_at" IS NULL
        AND (
          publication."snapshot" -> 'projection' ->> 'endsAt'
        )::TIMESTAMPTZ > CURRENT_TIMESTAMP
    )
  THEN
    RAISE EXCEPTION 'organizer event duplicate links require a publication';
  END IF;

  IF NEW."resolution" = 'LINKED'
    AND NEW."external_listing_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "external_listings" listing
      WHERE listing."id" = NEW."external_listing_id"
        AND listing."status" = 'PUBLISHED'
        AND listing."ends_at" > CURRENT_TIMESTAMP
    )
  THEN
    RAISE EXCEPTION 'external duplicate links require a published listing';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_duplicate_matches_target_correlation
BEFORE INSERT OR UPDATE OF "event_id", "external_listing_id", "resolution"
ON "listing_duplicate_matches"
FOR EACH ROW EXECUTE FUNCTION enforce_listing_duplicate_match_target();

CREATE OR REPLACE FUNCTION protect_listing_duplicate_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."resolution" <> 'UNRESOLVED' THEN
      RAISE EXCEPTION 'resolved listing duplicate matches cannot be deleted';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."candidate_id" IS DISTINCT FROM OLD."candidate_id"
    OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
    OR NEW."external_listing_id" IS DISTINCT FROM OLD."external_listing_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
  THEN
    RAISE EXCEPTION 'listing duplicate match identity is immutable';
  END IF;

  IF OLD."resolution" <> 'UNRESOLVED' THEN
    RAISE EXCEPTION 'listing duplicate match resolution is terminal';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER listing_duplicate_matches_protected
BEFORE UPDATE OR DELETE ON "listing_duplicate_matches"
FOR EACH ROW EXECUTE FUNCTION protect_listing_duplicate_match();

INSERT INTO "listing_import_sources" (
  "id",
  "key",
  "name",
  "allowed_hosts",
  "allowed_query_parameters",
  "enabled",
  "production_allowed",
  "created_at",
  "updated_at"
)
VALUES
  (
    gen_random_uuid(),
    'fixture',
    'Fixture',
    ARRAY['fixture.invalid']::VARCHAR(253)[],
    ARRAY[]::VARCHAR(100)[],
    true,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'estatesales-org',
    'EstateSales.org',
    ARRAY['estatesales.org', 'www.estatesales.org']::VARCHAR(253)[],
    ARRAY[]::VARCHAR(100)[],
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
