import { describe, expect, it, vi } from "vitest";

import { PrismaPaymentRepository } from "@/modules/payments/infrastructure/prisma-payment-repository";

describe("public organizer publication lookup", () => {
  it("requires an active owner and an event that has not ended", async () => {
    const findFirst = vi.fn(async () => null);
    const repository = new PrismaPaymentRepository({
      eventPublication: { findFirst },
    } as never);
    const activeAfter = new Date("2026-08-25T15:00:00.000Z");

    await repository.findPublishedByPublicId({
      publicId: "abc123def456",
      eventType: "ESTATE_SALE",
      activeAfter,
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event: expect.objectContaining({
            endsAt: { gt: activeAfter },
            organizer: { user: { status: "ACTIVE" } },
          }),
        }),
      }),
    );
  });
});
