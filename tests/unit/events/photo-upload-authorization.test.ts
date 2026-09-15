import { describe, expect, it, vi } from "vitest";

import { EventService } from "@/modules/events/application/event-service";
import type { PhotoReservationRecord } from "@/modules/events/application/ports";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";
import { principal } from "../payments/fixtures";
import { readyEvent } from "./fixtures";

const eventId = "22222222-2222-4222-8222-222222222222";
const pathname = "test/event-22222222/reservation-1/source.bin";
const request = {
  expectedVersion: 7,
  photoId: "photo-1",
  reservationId: "reservation-1",
  pathname,
};

function fixture(changes: Partial<PhotoReservationRecord> = {}, exists = true) {
  const reservation: PhotoReservationRecord = {
    id: request.reservationId,
    eventId,
    photoId: request.photoId,
    stagingObjectKey: pathname,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    sourceContentType: "image/jpeg",
    expectedVersion: 11,
    ...changes,
  };
  const findOwned = vi.fn(
    async (): Promise<ReturnType<typeof readyEvent> | null> =>
      readyEvent({ id: eventId, version: 11 }),
  );
  const findPhotoReservation = vi.fn(async () => (exists ? reservation : null));
  const service = new EventService(
    { findOwned, findPhotoReservation } as never,
    {} as never,
    {} as never,
    {} as never,
    "test",
  );
  return { service, findOwned, findPhotoReservation };
}

describe("overlapping photo upload authorization", () => {
  it("authorizes a valid reserved upload after sibling uploads advance the event", async () => {
    const saved = fixture();
    await expect(
      saved.service.authorizePhotoUpload(principal, eventId, request),
    ).resolves.toMatchObject({
      contentType: "image/jpeg",
      maximumSizeInBytes: 15 * 1024 * 1024,
    });
    expect(saved.findOwned).toHaveBeenCalledWith(eventId, principal.id);
    expect(saved.findPhotoReservation).toHaveBeenCalledWith({
      reservationId: request.reservationId,
      photoId: request.photoId,
      eventId,
      userId: principal.id,
    });
  });

  it("rejects a future revision without looking up an upload", async () => {
    const saved = fixture();
    await expect(
      saved.service.authorizePhotoUpload(principal, eventId, {
        ...request,
        expectedVersion: 12,
      }),
    ).rejects.toThrow();
    expect(saved.findPhotoReservation).not.toHaveBeenCalled();
  });

  it.each([
    { consumedAt: new Date() },
    { expiresAt: new Date(Date.now() - 60_000) },
    { stagingObjectKey: "test/another-event/another-reservation/source.bin" },
    { sourceContentType: "text/html" },
  ])(
    "rejects invalid reservations despite an earlier event version %#",
    async (changes) => {
      await expect(
        fixture(changes).service.authorizePhotoUpload(
          principal,
          eventId,
          request,
        ),
      ).rejects.toThrow("invalid or expired");
    },
  );

  it("rejects a missing or deleted upload reservation", async () => {
    await expect(
      fixture({}, false).service.authorizePhotoUpload(
        principal,
        eventId,
        request,
      ),
    ).rejects.toThrow("invalid or expired");
  });

  it("requires the repository lookup to match owner, event, photo, and reservation together", async () => {
    const findFirst = vi.fn(async () => null);
    const repository = new PrismaEventRepository({
      uploadReservation: { findFirst },
    } as never);
    await expect(
      repository.findPhotoReservation({
        eventId,
        userId: principal.id,
        photoId: request.photoId,
        reservationId: request.reservationId,
      }),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: request.reservationId,
          photoId: request.photoId,
          eventId,
          event: { organizer: { userId: principal.id } },
        },
      }),
    );
  });

  it("rejects a foreign or deleted event before authorizing its reservation", async () => {
    const saved = fixture();
    saved.findOwned.mockResolvedValue(null);
    await expect(
      saved.service.authorizePhotoUpload(principal, eventId, request),
    ).rejects.toThrow("not found");
    expect(saved.findPhotoReservation).not.toHaveBeenCalled();
  });
});
