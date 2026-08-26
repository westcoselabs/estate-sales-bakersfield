import { describe, expect, it, vi } from "vitest";

import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";

describe("anonymous event media authorization", () => {
  it("requires active ownership and an unexpired publication", async () => {
    const findFirst = vi.fn(async () => null);
    const repository = new PrismaEventRepository({
      eventPhoto: { findFirst },
    } as never);
    const now = new Date("2026-08-25T15:00:00.000Z");

    await repository.findPhotoVariantForPrincipal({
      photoId: "10000000-0000-4000-8000-000000000001",
      variant: "cover",
      userId: null,
      administrator: false,
      now,
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              event: expect.objectContaining({
                endsAt: { gt: now },
                organizer: { user: { status: "ACTIVE" } },
              }),
            },
          ],
        }),
      }),
    );
  });
});
