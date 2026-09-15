-- Derive searchable fields once from the immutable paid publication. Do not
-- move publication authority back to the mutable event or payment attempt.
CREATE TABLE "publication_search_documents" (
  "publication_id" UUID PRIMARY KEY REFERENCES "event_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "event_type" "event_type" NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "privacy_mode" "address_privacy_mode" NOT NULL,
  "city" VARCHAR(100) NOT NULL,
  "region" VARCHAR(100) NOT NULL,
  "public_id" VARCHAR(12) NOT NULL,
  CONSTRAINT "publication_search_documents_schedule_check" CHECK ("ends_at" > "starts_at")
);

CREATE FUNCTION derive_publication_search_document() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "publication_search_documents" (
    "publication_id", "event_type", "starts_at", "ends_at", "privacy_mode", "city", "region", "public_id"
  ) VALUES (
    NEW."id",
    (NEW."snapshot" -> 'projection' ->> 'eventType')::"event_type",
    (NEW."snapshot" -> 'projection' ->> 'startsAt')::timestamptz,
    (NEW."snapshot" -> 'projection' ->> 'endsAt')::timestamptz,
    (NEW."snapshot" ->> 'privacyMode')::"address_privacy_mode",
    NEW."snapshot" -> 'projection' -> 'address' ->> 'city',
    NEW."snapshot" -> 'projection' -> 'address' ->> 'region',
    NEW."public_id"
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_publications_search_document
AFTER INSERT ON "event_publications"
FOR EACH ROW EXECUTE FUNCTION derive_publication_search_document();

INSERT INTO "publication_search_documents" (
  "publication_id", "event_type", "starts_at", "ends_at", "privacy_mode", "city", "region", "public_id"
)
SELECT "id", ("snapshot" -> 'projection' ->> 'eventType')::"event_type",
  ("snapshot" -> 'projection' ->> 'startsAt')::timestamptz,
  ("snapshot" -> 'projection' ->> 'endsAt')::timestamptz,
  ("snapshot" ->> 'privacyMode')::"address_privacy_mode",
  "snapshot" -> 'projection' -> 'address' ->> 'city',
  "snapshot" -> 'projection' -> 'address' ->> 'region', "public_id"
FROM "event_publications";

CREATE TRIGGER publication_search_documents_immutable
BEFORE UPDATE OR DELETE ON "publication_search_documents"
FOR EACH ROW EXECUTE FUNCTION prevent_event_publication_mutation();

CREATE INDEX "publication_search_location_order_idx"
  ON "publication_search_documents" ("city", "region", "starts_at", "public_id");
CREATE INDEX "publication_search_location_type_order_idx"
  ON "publication_search_documents" ("city", "region", "event_type", "starts_at", "public_id");
CREATE INDEX "publication_search_ends_at_idx"
  ON "publication_search_documents" ("ends_at");

-- Viewport envelopes are planar longitude/latitude rectangles. Keep these
-- expression indexes separate from the geography indexes used for distances.
CREATE INDEX "event_locations_viewport_gix"
  ON "event_locations" USING GIST (("coordinates"::public.geometry));
CREATE INDEX "external_listing_locations_viewport_gix"
  ON "external_listing_locations" USING GIST (("coordinates"::public.geometry));

-- Queue claiming uses both queue and due time. Historical terminal jobs should
-- not increase the size of the index used to find the next runnable batch.
CREATE INDEX "durable_jobs_runnable_queue_run_at_created_at_idx"
  ON "durable_jobs" ("queue", "run_at", "created_at")
  WHERE "status" IN ('PENDING', 'FAILED');

-- Shared cache generations change in the SAME transaction as visibility.
-- A lookup can never reuse a pre-removal entry after reading the new version,
-- including mutations performed by workers or administrative SQL.
CREATE TABLE "public_search_revision" (
  "id" SMALLINT PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "revision" BIGINT NOT NULL DEFAULT 0
);
INSERT INTO "public_search_revision" ("id") VALUES (1);

CREATE FUNCTION advance_public_search_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "public_search_revision" SET "revision" = "revision" + 1 WHERE "id" = 1;
  RETURN NULL;
END;
$$;

CREATE TRIGGER event_publications_search_revision
AFTER INSERT ON "event_publications"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();

CREATE TRIGGER events_search_revision
AFTER UPDATE OF "canceled_at", "deleted_at", "removed_at" ON "events"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();

CREATE TRIGGER users_search_revision
AFTER UPDATE OF "status" ON "users"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();

CREATE TRIGGER external_listings_search_revision
AFTER INSERT OR UPDATE OR DELETE ON "external_listings"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();

CREATE TRIGGER source_records_search_revision
AFTER UPDATE OF "linked_event_id" ON "listing_source_records"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();

CREATE TRIGGER event_locations_search_revision
AFTER INSERT OR UPDATE OR DELETE ON "event_locations"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();

CREATE TRIGGER external_locations_search_revision
AFTER INSERT OR UPDATE OR DELETE ON "external_listing_locations"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();
