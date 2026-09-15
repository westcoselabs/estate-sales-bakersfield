-- Daily opening hours are opt-in. Existing listings keep their approved schedule
-- and use starts_at as the legacy hidden-address release instant.
ALTER TABLE "events"
  ADD COLUMN "schedule_days" JSONB,
  ADD COLUMN "address_reveal_at" TIMESTAMPTZ(3);

ALTER TABLE "events"
  ADD CONSTRAINT "events_schedule_days_array"
  CHECK ("schedule_days" IS NULL OR
    (jsonb_typeof("schedule_days") = 'array' AND
      jsonb_array_length("schedule_days") BETWEEN 1 AND 366));
