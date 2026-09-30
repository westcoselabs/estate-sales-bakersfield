import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "@/modules/auth";
import { EventService } from "@/modules/events/application/event-service";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";
import { parseMediaObjectKey } from "@/modules/media/domain/object-key";
import { SharpImageProcessor } from "@/modules/media/infrastructure/sharp-image-processor";
import { InMemoryMediaStore } from "../contract/blob/in-memory-media-store";
import { createIntegrationClient } from "./support/database";
import { testEmail } from "./support/test-run";

const prisma = createIntegrationClient();
const repository = new PrismaEventRepository(prisma);
afterAll(() => prisma.$disconnect());

async function fixture() {
  const email = testEmail(`photo-v2-${randomUUID()}`);
  const user = await prisma.user.create({
    data: {
      email,
      normalizedEmail: email,
      displayName: "Photo uploader fixture",
      passwordHash: "test-only",
      organizerProfile: { create: { status: "INCOMPLETE" } },
    },
  });
  const principal: AuthPrincipal = {
    id: user.id,
    email,
    displayName: user.displayName,
    emailVerifiedAt: null,
    role: "USER",
    status: "ACTIVE",
  };
  const event = await repository.createOwned({
    ownerUserId: user.id,
    eventType: "ESTATE_SALE",
    publicId: randomBytes(6).toString("hex"),
    slug: "photo-test",
    audit: {},
  });
  const media = new InMemoryMediaStore();
  const images = new SharpImageProcessor();
  const service = new EventService(
    repository,
    {} as never,
    media,
    images,
    "test",
  );
  return { principal, event, media, images, service };
}

describe("photo upload v2 database invariants", () => {
  it("reserves once under concurrent retries, rejects changed metadata, and uses the prepared byte limit", async () => {
    const { principal, event, service } = await fixture();
    const input = {
      clientUploadId: randomUUID(),
      byteLength: 800_000,
      contentType: "image/jpeg" as const,
    };
    const [first, repeated] = await Promise.all([
      service.reservePhoto(principal, event.id, input),
      service.reservePhoto(principal, event.id, input),
    ]);
    expect(repeated.photoId).toBe(first.photoId);
    expect(repeated.reservationId).toBe(first.reservationId);
    expect((await service.get(principal, event.id)).photos).toHaveLength(1);
    await expect(
      service.reservePhoto(principal, event.id, {
        ...input,
        byteLength: 800_001,
      }),
    ).rejects.toThrow("identifier");
    await expect(
      service.authorizePhotoUpload(principal, event.id, {
        photoId: first.photoId,
        reservationId: first.reservationId,
        pathname: first.uploadPathname,
      }),
    ).resolves.toMatchObject({ maximumSizeInBytes: 800_000 });
  });

  it("admits the 150th prepared reservation without charging every file 15 MiB", async () => {
    const { principal, event, service } = await fixture();
    const photos = Array.from({ length: 149 }, (_, index) => ({
      id: randomUUID(),
      eventId: event.id,
      sortOrder: index + 1,
      stagingObjectKey: `test/${randomUUID()}`,
      sourceContentType: "image/jpeg",
    }));
    await prisma.eventPhoto.createMany({ data: photos });
    await prisma.uploadReservation.createMany({
      data: photos.map((photo) => ({
        eventId: event.id,
        photoId: photo.id,
        stagingObjectKey: photo.stagingObjectKey,
        expiresAt: new Date(Date.now() + 600_000),
        maximumSizeInBytes: 800_000,
      })),
    });
    const result = await service.reservePhoto(principal, event.id, {
      clientUploadId: randomUUID(),
      byteLength: 800_000,
      contentType: "image/jpeg",
    });
    expect(result.event.photos).toHaveLength(150);
    await expect(
      service.reservePhoto(principal, event.id, {
        clientUploadId: randomUUID(),
        byteLength: 800_000,
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow();
    const cleaned = await service.deletePhoto(
      principal,
      event.id,
      result.photoId,
      result.event.version,
      {},
      true,
    );
    expect(cleaned.photos).toHaveLength(149);
    const retry = await service.reservePhoto(principal, event.id, {
      clientUploadId: randomUUID(),
      byteLength: 800_000,
      contentType: "image/jpeg",
    });
    expect(retry.event.photos).toHaveLength(150);
    expect(
      new Set(retry.event.photos.map((photo) => photo.sortOrder)).size,
    ).toBe(150);
  });

  it("finishes two photos while another reservation and a details edit advance the event", async () => {
    const { principal, event, service, media, images } = await fixture();
    const bytes = await sharp({
      create: { width: 80, height: 60, channels: 3, background: "#aabbcc" },
    })
      .jpeg()
      .toBuffer();
    const reservations: Awaited<ReturnType<EventService["reservePhoto"]>>[] =
      [];
    for (let index = 0; index < 2; index++) {
      const reservation = await service.reservePhoto(principal, event.id, {
        clientUploadId: randomUUID(),
        byteLength: bytes.length,
        contentType: "image/jpeg",
      });
      media.putFixture(parseMediaObjectKey(reservation.uploadPathname), bytes);
      reservations.push(reservation);
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const realProcess = images.process.bind(images);
    const process = vi
      .spyOn(images, "process")
      .mockImplementation(async (source) => {
        await gate;
        return realProcess(source);
      });
    const finalize = (index: number) => {
      const reservation = reservations[index]!;
      return service.finalizePhoto(principal, event.id, reservation.photoId, {
        reservationId: reservation.reservationId,
        pathname: reservation.uploadPathname,
      });
    };
    const first = finalize(0);
    const second = finalize(1);
    try {
      await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(2), {
        timeout: 15_000,
      });
      expect(
        (await finalize(0)).photos.find(
          (photo) => photo.id === reservations[0]!.photoId,
        )?.status,
      ).toBe("PROCESSING");
      const third = await service.reservePhoto(principal, event.id, {
        clientUploadId: randomUUID(),
        byteLength: bytes.length,
        contentType: "image/jpeg",
      });
      await service.updateDetails(principal, event.id, {
        expectedVersion: third.event.version,
        title: "Concurrent title survives",
        description:
          "A useful listing description while the photos finish uploading.",
      });
    } finally {
      release();
    }
    await Promise.all([first, second]);
    const saved = await service.get(principal, event.id);
    expect(saved.title).toBe("Concurrent title survives");
    expect(
      saved.photos.filter((photo) => photo.status === "READY"),
    ).toHaveLength(2);
    await finalize(0);
    expect(process).toHaveBeenCalledTimes(2);
    expect(
      await media.inspect(parseMediaObjectKey(reservations[0]!.uploadPathname)),
    ).toBeNull();
  }, 60_000);

  it("rejects a file larger than its reservation", async () => {
    const { principal, event, service, media } = await fixture();
    const reservation = await service.reservePhoto(principal, event.id, {
      clientUploadId: randomUUID(),
      byteLength: 1,
      contentType: "image/jpeg",
    });
    media.putFixture(
      parseMediaObjectKey(reservation.uploadPathname),
      new Uint8Array(2),
    );
    await expect(
      service.finalizePhoto(principal, event.id, reservation.photoId, {
        reservationId: reservation.reservationId,
        pathname: reservation.uploadPathname,
      }),
    ).rejects.toThrow("validation");
    expect((await service.get(principal, event.id)).photos[0]?.status).toBe(
      "FAILED",
    );
    expect(
      await media.inspect(parseMediaObjectKey(reservation.uploadPathname)),
    ).toBeNull();
  });
  it.each(["deletion", "expired lease", "replaced attempt"] as const)(
    "fences completion after %s",
    async (change) => {
      const { principal, event, service, media, images } = await fixture();
      const bytes = await sharp({
        create: { width: 40, height: 60, channels: 3, background: "#765432" },
      })
        .jpeg()
        .toBuffer();
      const reservation = await service.reservePhoto(principal, event.id, {
        clientUploadId: randomUUID(),
        byteLength: bytes.length,
        contentType: "image/jpeg",
      });
      media.putFixture(parseMediaObjectKey(reservation.uploadPathname), bytes);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const realProcess = images.process.bind(images);
      const process = vi
        .spyOn(images, "process")
        .mockImplementation(async (source) => {
          await gate;
          return realProcess(source);
        });
      const writes = vi.spyOn(media, "putPrivate");
      const finishing = service
        .finalizePhoto(principal, event.id, reservation.photoId, {
          reservationId: reservation.reservationId,
          pathname: reservation.uploadPathname,
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      try {
        await vi.waitFor(() => expect(process).toHaveBeenCalledOnce(), {
          timeout: 15_000,
        });
        if (change === "deletion") {
          const current = await service.get(principal, event.id);
          await service.deletePhoto(
            principal,
            event.id,
            reservation.photoId,
            current.version,
          );
        } else {
          await prisma.uploadReservation.update({
            where: { id: reservation.reservationId },
            data:
              change === "expired lease"
                ? { expiresAt: new Date(Date.now() - 100) }
                : { processingAttemptId: randomUUID() },
          });
        }
      } finally {
        release();
      }
      expect(await finishing).toBeInstanceOf(Error);
      const saved = await service.get(principal, event.id);
      const photo = saved.photos.find(
        (item) => item.id === reservation.photoId,
      );
      expect(photo?.status).not.toBe("READY");
      if (change === "replaced attempt")
        expect(photo?.status).toBe("PROCESSING");
      for (const [key] of writes.mock.calls)
        expect(await media.inspect(key)).toBeNull();
    },
    60_000,
  );

  it("makes a commit failure after source deletion terminal and permits a fresh reservation", async () => {
    const { principal, event, service, media } = await fixture();
    const bytes = await sharp({
      create: { width: 40, height: 60, channels: 3, background: "#567890" },
    })
      .jpeg()
      .toBuffer();
    const reservation = await service.reservePhoto(principal, event.id, {
      clientUploadId: randomUUID(),
      byteLength: bytes.length,
      contentType: "image/jpeg",
    });
    media.putFixture(parseMediaObjectKey(reservation.uploadPathname), bytes);
    const commit = vi
      .spyOn(repository, "completePhoto")
      .mockRejectedValueOnce(new Error("Simulated database outage"));
    try {
      await expect(
        service.finalizePhoto(principal, event.id, reservation.photoId, {
          reservationId: reservation.reservationId,
          pathname: reservation.uploadPathname,
        }),
      ).rejects.toThrow();
    } finally {
      commit.mockRestore();
    }
    expect(
      await media.inspect(parseMediaObjectKey(reservation.uploadPathname)),
    ).toBeNull();
    const current = await service.get(principal, event.id);
    expect(current.photos[0]?.status).toBe("FAILED");
    await service.deletePhoto(
      principal,
      event.id,
      reservation.photoId,
      current.version,
    );
    const retry = await service.reservePhoto(principal, event.id, {
      clientUploadId: randomUUID(),
      byteLength: bytes.length,
      contentType: "image/jpeg",
    });
    expect(retry.photoId).not.toBe(reservation.photoId);
    media.putFixture(parseMediaObjectKey(retry.uploadPathname), bytes);
    const ready = await service.finalizePhoto(
      principal,
      event.id,
      retry.photoId,
      { reservationId: retry.reservationId, pathname: retry.uploadPathname },
    );
    expect(
      ready.photos.find((photo) => photo.id === retry.photoId)?.status,
    ).toBe("READY");
  });
});
