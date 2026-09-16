-- Keep the original paid publication immutable. Organizer edits have a separate
-- current snapshot and commit with event content, search dates and cache revision.
ALTER TABLE "events" ADD COLUMN "published_snapshot" JSONB;

DROP TRIGGER publication_search_documents_immutable ON "publication_search_documents";
CREATE TRIGGER publication_search_documents_no_delete
BEFORE DELETE ON "publication_search_documents"
FOR EACH ROW EXECUTE FUNCTION prevent_event_publication_mutation();

-- Search identity remains fixed; only dates matching the current publication
-- content may change. Unrelated writes cannot make an old sale look active.
CREATE FUNCTION guard_edited_publication_search_document() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE current_snapshot JSONB;
BEGIN
  IF (to_jsonb(NEW) - 'starts_at' - 'ends_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'starts_at' - 'ends_at') THEN
    RAISE EXCEPTION 'publication search identity is immutable';
  END IF;
  SELECT COALESCE(event."published_snapshot", publication."snapshot")
  INTO current_snapshot
  FROM "event_publications" AS publication
  JOIN "events" AS event ON event."id" = publication."event_id"
  WHERE publication."id" = NEW."publication_id";
  IF NEW."starts_at" IS DISTINCT FROM (current_snapshot -> 'projection' ->> 'startsAt')::timestamptz
     OR NEW."ends_at" IS DISTINCT FROM (current_snapshot -> 'projection' ->> 'endsAt')::timestamptz THEN
    RAISE EXCEPTION 'publication search dates must match the current snapshot';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER publication_search_documents_guard_update
BEFORE UPDATE ON "publication_search_documents"
FOR EACH ROW EXECUTE FUNCTION guard_edited_publication_search_document();

CREATE FUNCTION refresh_edited_publication_search_document() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."published_snapshot" IS DISTINCT FROM OLD."published_snapshot"
     AND NEW."published_snapshot" IS NOT NULL THEN
    UPDATE "publication_search_documents" AS document
    SET "starts_at" = (NEW."published_snapshot" -> 'projection' ->> 'startsAt')::timestamptz,
        "ends_at" = (NEW."published_snapshot" -> 'projection' ->> 'endsAt')::timestamptz
    FROM "event_publications" AS publication
    WHERE publication."event_id" = NEW."id"
      AND document."publication_id" = publication."id";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_edited_publication_search_document
AFTER UPDATE OF "published_snapshot" ON "events"
FOR EACH ROW EXECUTE FUNCTION refresh_edited_publication_search_document();

CREATE TRIGGER events_edited_publication_search_revision
AFTER UPDATE OF "published_snapshot" ON "events"
FOR EACH STATEMENT EXECUTE FUNCTION advance_public_search_revision();
