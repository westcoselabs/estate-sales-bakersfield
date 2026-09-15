import { describe, expect, it, vi } from "vitest";

import { EventService } from "@/modules/events/application/event-service";
import { EventResourceLimitError } from "@/modules/events/domain/errors";
import { DatabaseEventWorkLimiter } from "@/modules/events/infrastructure/event-work-limiter";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";
import {
  MAXIMUM_ACTIVE_DRAFTS_PER_ACCOUNT,
  MAXIMUM_SOURCE_BYTES_PER_ACCOUNT,
  MAXIMUM_ACCOUNT_PHOTO_PROCESSING,
} from "@/modules/events/domain/resource-policy";
import { principal } from "../payments/fixtures";

describe("event resource admission", () => {
  it("invalidates a previous approval atomically when an additional upload is reserved", async () => {
    const updateMany = vi
      .fn<
        (input: { data: Record<string, unknown> }) => Promise<{ count: number }>
      >()
      .mockResolvedValue({ count: 1 });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "event",
        workflowState: "APPROVED_FOR_PAYMENT",
      })
      .mockResolvedValue(null);
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ photos: 1n, bytes: 100n }])
      .mockResolvedValue([]);
    const create = vi.fn();
    const transaction = {
      $queryRaw: query,
      event: { findFirst, updateMany },
      eventPhoto: { count: async () => 1, create },
      auditEntry: { create: vi.fn() },
      durableJob: { create: vi.fn() },
    };
    const repository = new PrismaEventRepository({
      $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run(transaction),
    } as never);
    await repository.createPhotoReservation({
      userId: principal.id,
      eventId: "event",
      photoId: "photo",
      reservationId: "reservation",
      expectedVersion: 7,
      stagingObjectKey: "key",
      expiresAt: new Date(Date.now() + 60_000),
      sourceContentType: "image/jpeg",
      audit: {},
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: "NOT_APPROVED",
          currentApprovalId: null,
          approvalDigest: null,
          workflowState: "PREVIEW_READY",
          version: { increment: 1 },
        }),
      }),
    );
    expect(updateMany.mock.calls[0]?.[0].data).not.toHaveProperty(
      "contentRevision",
    );
    expect(create).toHaveBeenCalledOnce();
  });
  it("admits a full photo batch while keeping the per-account processing cap", async () => {
    const consume = vi.fn(async () => ({ allowed: true }));
    const limiter = new DatabaseEventWorkLimiter({ consume } as never);
    await limiter.consume("user", "reserve");
    await limiter.consume("user", "finalize");
    expect(consume).toHaveBeenNthCalledWith(1, {
      namespace: "event-work:reserve",
      identifier: "user",
      limit: 180,
      windowSeconds: 60,
    });
    expect(consume).toHaveBeenNthCalledWith(2, {
      namespace: "event-work:finalize",
      identifier: "user",
      limit: 180,
      windowSeconds: 60,
    });
    expect(MAXIMUM_ACCOUNT_PHOTO_PROCESSING).toBe(2);
  });
  it("uses shared runtime slots without queueing and releases them idempotently", () => {
    const first = new DatabaseEventWorkLimiter({} as never);
    const second = new DatabaseEventWorkLimiter({} as never);
    const release = first.acquireProcessing();
    expect(() => second.acquireProcessing()).toThrow(EventResourceLimitError);
    release();
    release();
    const nextRelease = second.acquireProcessing();
    expect(() => first.acquireProcessing()).toThrow(EventResourceLimitError);
    nextRelease();
  });

  it("fails closed on limiter failure and returns provider retry time on denial", async () => {
    const consume = vi
      .fn()
      .mockRejectedValueOnce(new Error("private provider detail"))
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 17 });
    const limiter = new DatabaseEventWorkLimiter({ consume } as never);
    await expect(limiter.consume("user", "create")).rejects.toMatchObject({
      code: "LIMITER_UNAVAILABLE",
    });
    await expect(limiter.consume("user", "finalize")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 17,
    });
    expect(consume).toHaveBeenLastCalledWith(
      expect.objectContaining({
        namespace: "event-work:finalize",
        identifier: "user",
      }),
    );
  });

  it("leaves the upload untouched when no runtime processing slot is available", async () => {
    const findOwned = vi.fn();
    const read = vi.fn();
    const limiter = new DatabaseEventWorkLimiter({
      consume: async () => ({ allowed: true }),
    } as never);
    const release = limiter.acquireProcessing();
    try {
      const service = new EventService(
        { findOwned } as never,
        {} as never,
        { read } as never,
        {} as never,
        "test",
        undefined,
        limiter,
      );
      await expect(
        service.finalizePhoto(principal, "event", "photo", {
          reservationId: "reservation",
          expectedVersion: 1,
          pathname: "unused",
        }),
      ).rejects.toMatchObject({ code: "PROCESSING_BUSY" });
      expect(findOwned).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });

  it("releases the runtime processing slot when validation fails", async () => {
    const limiter = new DatabaseEventWorkLimiter({
      consume: async () => ({ allowed: true }),
    } as never);
    const service = new EventService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      "test",
      undefined,
      limiter,
    );
    await expect(
      service.finalizePhoto(principal, "invalid", "photo", {
        reservationId: "reservation",
        expectedVersion: 1,
        pathname: "unused",
      }),
    ).rejects.toThrow();
    const release = limiter.acquireProcessing();
    release();
  });

  it("rejects draft creation at the account cap before inserting anything", async () => {
    const create = vi.fn();
    const lock = vi.fn(async () => []);
    const transaction = {
      $queryRaw: lock,
      event: { count: async () => MAXIMUM_ACTIVE_DRAFTS_PER_ACCOUNT, create },
    };
    const repository = new PrismaEventRepository({
      $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run(transaction),
    } as never);
    await expect(
      repository.createOwned({
        ownerUserId: principal.id,
        eventType: "YARD_SALE",
        publicId: "111111111111",
        slug: "sale",
        audit: {},
      }),
    ).rejects.toMatchObject({ code: "DRAFT_LIMIT" });
    expect(lock).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it("reserves worst-case bytes before admitting another upload", async () => {
    const create = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { photos: 1n, bytes: BigInt(MAXIMUM_SOURCE_BYTES_PER_ACCOUNT) },
      ]);
    const transaction = { $queryRaw: query, eventPhoto: { create } };
    const repository = new PrismaEventRepository({
      $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run(transaction),
    } as never);
    await expect(
      repository.createPhotoReservation({
        userId: principal.id,
        eventId: "event",
        photoId: "photo",
        reservationId: "reservation",
        expectedVersion: 1,
        stagingObjectKey: "key",
        expiresAt: new Date(),
        sourceContentType: "image/jpeg",
        audit: {},
      }),
    ).rejects.toMatchObject({ code: "MEDIA_LIMIT" });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not consume the upload when account processing slots are occupied", async () => {
    const updateMany = vi.fn();
    const transaction = {
      $queryRaw: async () => [],
      eventPhoto: { count: async () => 2 },
      event: { updateMany },
    };
    const repository = new PrismaEventRepository({
      $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run(transaction),
    } as never);
    await expect(
      repository.markPhotoProcessing({
        userId: principal.id,
        eventId: "event",
        photoId: "photo",
        reservationId: "reservation",
        expectedVersion: 1,
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: "PROCESSING_BUSY" });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
