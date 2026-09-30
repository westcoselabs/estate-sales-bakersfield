ALTER TABLE "upload_reservations"
  ADD COLUMN "client_upload_id" UUID,
  ADD COLUMN "maximum_size_in_bytes" INTEGER NOT NULL DEFAULT 15728640,
  ADD COLUMN "processing_attempt_id" UUID;

ALTER TABLE "upload_reservations" ADD CONSTRAINT "upload_reservation_byte_limit"
  CHECK ("maximum_size_in_bytes" > 0 AND "maximum_size_in_bytes" <= 15728640);

CREATE UNIQUE INDEX "upload_reservations_event_id_client_upload_id_key"
  ON "upload_reservations"("event_id", "client_upload_id");
