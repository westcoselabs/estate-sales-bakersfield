import { describe, expect, it, vi } from "vitest";

import { PrismaOrganizerProfileRepository } from "@/modules/organizers/infrastructure/prisma-organizer-profile-repository";

describe("Prisma organizer profile repository", () => {
  it("atomically advances event revisions and invalidates approval for public profile changes", async () => {
    const profile = {
      id: "organizer-1",
      userId: "user-1",
      displayName: "Updated organizer",
      contactName: "Contact",
      contactEmail: "contact@example.test",
      contactPhone: null,
      websiteUrl: "https://updated.example.test/",
      status: "COMPLETE" as const,
      createdAt: new Date("2026-07-20T00:00:00.000Z"),
      updatedAt: new Date("2026-07-21T00:00:00.000Z"),
    };
    const transaction = {
      organizerProfile: {
        findUnique: vi.fn().mockResolvedValue({
          id: profile.id,
          displayName: "Original organizer",
          websiteUrl: "https://original.example.test/",
          status: "COMPLETE",
        }),
        upsert: vi.fn().mockResolvedValue(profile),
      },
      event: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "event-approved", approvalStatus: "APPROVED" },
          ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditEntry: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new PrismaOrganizerProfileRepository(prisma as never);

    await repository.saveForUser({
      userId: profile.userId,
      displayName: profile.displayName,
      contactName: profile.contactName,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone,
      websiteUrl: profile.websiteUrl,
      status: profile.status,
      audit: { requestId: "organizer-public-change" },
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(transaction.event.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["event-approved"] },
        organizerId: profile.id,
      },
      data: expect.objectContaining({
        version: { increment: 1 },
        contentRevision: { increment: 1 },
        workflowState: "PREVIEW_READY",
        approvalStatus: "NOT_APPROVED",
        approvedRevision: null,
        approvalDigest: null,
        currentApprovalId: null,
      }),
    });
    expect(transaction.auditEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "EVENT_APPROVAL_INVALIDATED",
          targetId: "event-approved",
          metadata: { reason: "ORGANIZER_PUBLIC_PROFILE_CHANGED" },
        }),
      ],
    });
  });
});
