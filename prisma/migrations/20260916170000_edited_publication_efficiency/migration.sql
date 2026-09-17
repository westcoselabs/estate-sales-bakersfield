-- A live-content edit invalidates the public search cache through the events
-- trigger. Only touch the date projection when those indexed dates changed;
-- this avoids a second revision bump and a redundant search-document write for
-- title and photo edits.
CREATE OR REPLACE FUNCTION refresh_edited_publication_search_document() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE previous_snapshot JSONB;
BEGIN
  IF NEW."published_snapshot" IS DISTINCT FROM OLD."published_snapshot"
     AND NEW."published_snapshot" IS NOT NULL THEN
    SELECT COALESCE(OLD."published_snapshot", publication."snapshot")
    INTO previous_snapshot
    FROM "event_publications" AS publication
    WHERE publication."event_id" = NEW."id";

    IF (NEW."published_snapshot" -> 'projection' ->> 'startsAt') IS DISTINCT FROM
         (previous_snapshot -> 'projection' ->> 'startsAt')
       OR (NEW."published_snapshot" -> 'projection' ->> 'endsAt') IS DISTINCT FROM
         (previous_snapshot -> 'projection' ->> 'endsAt') THEN
      UPDATE "publication_search_documents" AS document
      SET "starts_at" = (NEW."published_snapshot" -> 'projection' ->> 'startsAt')::timestamptz,
          "ends_at" = (NEW."published_snapshot" -> 'projection' ->> 'endsAt')::timestamptz
      FROM "event_publications" AS publication
      WHERE publication."event_id" = NEW."id"
        AND document."publication_id" = publication."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
