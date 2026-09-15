import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  MAXIMUM_ACTIVE_DRAFTS_PER_ACCOUNT,
  MAXIMUM_RETAINED_PHOTOS_PER_ACCOUNT,
  PHOTO_PROCESSING_LEASE_MS,
  PHOTO_PROCESSING_PURGE_GRACE_MS,
} from "@/modules/events/domain/resource-policy";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";

import { createIntegrationClient } from "./support/database";
import { testEmail } from "./support/test-run";

const prisma = createIntegrationClient();
const repository = new PrismaEventRepository(prisma);
afterAll(() => prisma.$disconnect());

async function account(label: string, drafts: number) {
  const email = testEmail(`resource-${label}`);
  const user = await prisma.user.create({
    data: {
      email,
      normalizedEmail: email,
      displayName: "Resource budget fixture",
      passwordHash: "integration-test-password-hash",
      organizerProfile: { create: { status: "INCOMPLETE" } },
    },
    include: { organizerProfile: true },
  });
  const ids = Array.from({ length: drafts }, () => randomUUID());
  await prisma.event.createMany({
    data: ids.map((id) => ({
      id,
      organizerId: user.organizerProfile!.id,
      publicId: randomBytes(6).toString("hex"),
      eventType: "YARD_SALE" as const,
      slug: "sale",
    })),
  });
  return { user, ids };
}

describe("account resource limits in an isolated database", () => {
  it("acknowledges repeated photo cleanup without duplicate work or revisions", async () => {
    const { user, ids } = await account("cleanup-retry", 1);
    const eventId = ids[0]!;
    const photoId = randomUUID();
    await repository.createPhotoReservation({
      eventId,
      photoId,
      userId: user.id,
      reservationId: randomUUID(),
      expectedVersion: 1,
      stagingObjectKey: `cleanup-retry-${photoId}`,
      expiresAt: new Date(Date.now() + 600_000),
      sourceContentType: "image/jpeg",
      audit: {},
    });
    const deletion = {
      eventId,
      photoId,
      userId: user.id,
      workflowState: "INCOMPLETE_DRAFT" as const,
      now: new Date(),
      audit: {},
    };
    const first = await repository.deletePhoto({
      ...deletion,
      expectedVersion: 2,
    });
    expect(first).not.toBeNull();
    const repeated = await repository.deletePhoto({
      ...deletion,
      expectedVersion: first!.version,
    });
    expect(repeated?.version).toBe(first!.version);
    expect(repeated?.contentRevision).toBe(first!.contentRevision);
    expect(
      await prisma.durableJob.count({
        where: { deduplicationKey: `event-photo-purge:${photoId}` },
      }),
    ).toBe(1);
    expect(
      await prisma.auditEntry.count({
        where: { actorUserId: user.id, action: "EVENT_PHOTO_DELETED" },
      }),
    ).toBe(1);
  });

  it("serializes simultaneous draft admissions at the account boundary", async () => {
    const { user } = await account(
      "drafts",
      MAXIMUM_ACTIVE_DRAFTS_PER_ACCOUNT - 1,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        repository.createOwned({
          ownerUserId: user.id,
          publicId: randomBytes(6).toString("hex"),
          eventType: "YARD_SALE",
          slug: "sale",
          audit: {},
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(
      rejected?.status === "rejected" ? rejected.reason : null,
    ).toMatchObject({ code: "DRAFT_LIMIT" });
    expect(
      await prisma.event.count({ where: { organizer: { userId: user.id } } }),
    ).toBe(MAXIMUM_ACTIVE_DRAFTS_PER_ACCOUNT);
  });

  it("serializes uploads across separate drafts and charges retained deleted-event media", async () => {
    const { user, ids } = await account("photos", 5);
    await prisma.eventPhoto.createMany({
      data: Array.from(
        { length: MAXIMUM_RETAINED_PHOTOS_PER_ACCOUNT - 1 },
        (_, index) => ({
          eventId: ids[Math.floor(index / 150)]!,
          sortOrder: index % 150,
          status: "FAILED" as const,
          sourceSize: 1024,
          stagingObjectKey: `budget-fixture-${randomUUID()}`,
        }),
      ),
    });
    await prisma.event.update({
      where: { id: ids[0]! },
      data: { deletedAt: new Date() },
    });
    const results = await Promise.allSettled(
      ids.slice(3).map((eventId) =>
        repository.createPhotoReservation({
          userId: user.id,
          eventId,
          reservationId: randomUUID(),
          photoId: randomUUID(),
          expectedVersion: 1,
          stagingObjectKey: `reservation-fixture-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 600_000),
          sourceContentType: "image/jpeg",
          audit: {},
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(
      rejected?.status === "rejected" ? rejected.reason : null,
    ).toMatchObject({ code: "MEDIA_LIMIT" });
    expect(
      await prisma.eventPhoto.count({
        where: { event: { organizer: { userId: user.id } } },
      }),
    ).toBe(MAXIMUM_RETAINED_PHOTOS_PER_ACCOUNT);
    // Successful physical purge releases the account allowance even though
    // lifecycle rows remain available for audit/history.
    await repository.clearLifecycleMediaKeys(ids[0]!);
    const failedEvent = results[0]?.status === "rejected" ? ids[3]! : ids[4]!;
    await expect(
      repository.createPhotoReservation({
        userId: user.id,
        eventId: failedEvent,
        reservationId: randomUUID(),
        photoId: randomUUID(),
        expectedVersion: 1,
        stagingObjectKey: `after-purge-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 600_000),
        sourceContentType: "image/jpeg",
        audit: {},
      }),
    ).resolves.not.toBeNull();
  });

  it("renews late-start processing leases and delays cleanup without releasing account slots", async () => {
    const { user, ids } = await account("late-processing", 3);
    const base = Date.now();
    const originalExpiry = new Date(base + 600_000);
    const lateStart = new Date(originalExpiry.getTime() - 1_000);
    const renewedExpiry = new Date(
      lateStart.getTime() + PHOTO_PROCESSING_LEASE_MS,
    );
    const reservations = ids.map((eventId) => ({
      eventId,
      photoId: randomUUID(),
      reservationId: randomUUID(),
      userId: user.id,
    }));
    for (const [index, reservation] of reservations.entries()) {
      await repository.createPhotoReservation({
        ...reservation,
        expectedVersion: 1,
        stagingObjectKey: `late-processing-${reservation.reservationId}`,
        expiresAt: index < 2 ? originalExpiry : new Date(base + 1_200_000),
        sourceContentType: "image/jpeg",
        audit: {},
      });
    }
    for (const reservation of reservations.slice(0, 2)) {
      await expect(
        repository.markPhotoProcessing({
          ...reservation,
          expectedVersion: 2,
          now: lateStart,
        }),
      ).resolves.toBe(true);
      const stored = await prisma.uploadReservation.findUniqueOrThrow({
        where: { id: reservation.reservationId },
      });
      expect(stored.expiresAt).toEqual(renewedExpiry);
      const cleanup = await prisma.durableJob.findFirstOrThrow({
        where: {
          deduplicationKey: `photo-reservation-purge:${reservation.reservationId}`,
        },
      });
      expect(cleanup.runAt).toEqual(
        new Date(renewedExpiry.getTime() + PHOTO_PROCESSING_PURGE_GRACE_MS),
      );
      await expect(
        repository.findExpiredPhotoReservation({
          reservationId: reservation.reservationId,
          now: new Date(
            originalExpiry.getTime() + PHOTO_PROCESSING_PURGE_GRACE_MS + 1,
          ),
        }),
      ).resolves.toBeNull();
    }
    // Simulate admission from another runtime after the old upload deadline.
    await expect(
      repository.markPhotoProcessing({
        ...reservations[2]!,
        expectedVersion: 2,
        now: new Date(
          originalExpiry.getTime() + PHOTO_PROCESSING_PURGE_GRACE_MS + 1,
        ),
      }),
    ).rejects.toMatchObject({ code: "PROCESSING_BUSY" });
    await expect(
      repository.findExpiredPhotoReservation({
        reservationId: reservations[0]!.reservationId,
        now: new Date(
          renewedExpiry.getTime() + PHOTO_PROCESSING_PURGE_GRACE_MS,
        ),
      }),
    ).resolves.toMatchObject({ photoId: reservations[0]!.photoId });
  });

  it("rolls back processing admission when cleanup already owns the upload", async () => {
    const { user, ids } = await account("cleanup-processing-race", 1);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 600_000);
    const reservation = {
      eventId: ids[0]!,
      userId: user.id,
      reservationId: randomUUID(),
      photoId: randomUUID(),
    };
    await repository.createPhotoReservation({
      ...reservation,
      expectedVersion: 1,
      stagingObjectKey: `cleanup-race-${reservation.reservationId}`,
      expiresAt,
      sourceContentType: "image/jpeg",
      audit: {},
    });
    await prisma.durableJob.updateMany({
      where: {
        deduplicationKey: `photo-reservation-purge:${reservation.reservationId}`,
      },
      data: {
        status: "RUNNING",
        lockedAt: now,
        lockedBy: "integration-worker",
      },
    });
    await expect(
      repository.markPhotoProcessing({
        ...reservation,
        expectedVersion: 2,
        now,
      }),
    ).rejects.toMatchObject({ code: "PROCESSING_BUSY" });
    const photo = await prisma.eventPhoto.findUniqueOrThrow({
      where: { id: reservation.photoId },
    });
    expect(photo.status).toBe("RESERVED");
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: reservation.eventId },
    });
    expect(event.version).toBe(2);
    const stored = await prisma.uploadReservation.findUniqueOrThrow({
      where: { id: reservation.reservationId },
    });
    expect(stored.expiresAt).toEqual(expiresAt);
  });

  it("recovers a killed image worker only after the expired reservation grace period", async () => {
    const { ids } = await account("processing", 1);
    const now = new Date();
    const reservationId = randomUUID();
    const photo = await prisma.eventPhoto.create({
      data: {
        eventId: ids[0]!,
        sortOrder: 0,
        status: "PROCESSING",
        stagingObjectKey: `stale-${reservationId}`,
        uploadReservation: {
          create: {
            id: reservationId,
            eventId: ids[0]!,
            stagingObjectKey: `stale-${reservationId}`,
            createdAt: new Date(now.getTime() - 630_000),
            expiresAt: new Date(now.getTime() - 30_000),
          },
        },
      },
    });
    await expect(
      repository.findExpiredPhotoReservation({ reservationId, now }),
    ).resolves.toBeNull();
    await expect(
      repository.findExpiredPhotoReservation({
        reservationId,
        now: new Date(now.getTime() + 31_000),
      }),
    ).resolves.toMatchObject({ photoId: photo.id });
    await repository.deleteExpiredPhotoReservation({
      reservationId,
      now: new Date(now.getTime() + 31_000),
    });
    expect(
      await prisma.eventPhoto.findUnique({ where: { id: photo.id } }),
    ).toBeNull();
  });
});
