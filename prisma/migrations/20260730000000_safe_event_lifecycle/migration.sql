ALTER TABLE "events"
ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "events"
ADD CONSTRAINT "events_terminal_disposition_exclusive"
CHECK (
  (
    CASE WHEN "deleted_at" IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN "canceled_at" IS NOT NULL THEN 1 ELSE 0 END
    + CASE WHEN "removed_at" IS NOT NULL THEN 1 ELSE 0 END
  ) <= 1
);

CREATE INDEX "events_organizer_id_deleted_at_canceled_at_updated_at_idx"
ON "events"("organizer_id", "deleted_at", "canceled_at", "updated_at");
