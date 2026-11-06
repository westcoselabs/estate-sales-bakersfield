import { describe, expect, it, vi } from "vitest";
import type { EmailGateway } from "@/modules/email/application/ports";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ServerEnvironment } from "@/platform/config/env";
import { EmailJobProcessor } from "@/modules/email/infrastructure/email-job-processor";
import { EmailProviderError } from "@/modules/email/domain/errors";

function fixture() {
  const state = {
    id: "campaign",
    selectionMode: "CONTACT_SEGMENT",
    contactCategory: "ATTENDEE",
    contactSourceTag: "Simply Decorated",
    status: "PREPARING",
    version: 2,
    name: "Simply Decorated",
    subject: "Explore 148 photos",
    draftHtml:
      '<h1>148 photos</h1><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>',
    listingSnapshot: [
      {
        title: "Sale",
        path: "/sales/sale",
        city: "Bakersfield",
        startsAt: "2026-11-06",
        type: "ESTATE_SALE",
      },
    ],
    providerSegmentId: "segment",
    providerContactImportId: "import",
    providerBroadcastId: null,
    updatedAt: new Date(),
    lastErrorCode: null,
    recipientCount: 2,
  };
  const people = [
    { id: "one", email: "one@example.test", firstName: "One" },
    { id: "two", email: "two@example.test", firstName: "Two" },
  ];
  const prisma = {
    emailCampaign: {
      findUnique: vi.fn(async () => ({ ...state })),
      update: vi.fn(async ({ data }) => Object.assign(state, data)),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.status && state.status !== where.status) return { count: 0 };
        Object.assign(state, data);
        return { count: 1 };
      }),
    },
    $queryRaw: vi.fn(async () => [...people]),
  };
  const gateway = {
    send: vi.fn(),
    createSegment: vi.fn(),
    importContacts: vi.fn(),
    getContactImportStatus: vi.fn(async () => "completed" as const),
    listSegmentContacts: vi.fn(async () =>
      people.map((row) => ({ email: row.email, unsubscribed: false })),
    ),
    removeContactFromSegment: vi.fn(),
    createBroadcast: vi.fn<EmailGateway["createBroadcast"]>(async () => ({
      id: "broadcast",
    })),
    sendBroadcast: vi.fn(),
    updateContactSubscription: vi.fn(),
  };
  const environment = {
    APP_ENV: "production",
    EMAIL_CAMPAIGNS_ENABLED: true,
    RESEND_RESOURCE_ENV: "production",
    APP_URL: "https://example.test",
  } as ServerEnvironment;
  return {
    state,
    people,
    prisma,
    gateway,
    environment,
    worker: new EmailJobProcessor(
      prisma as unknown as PrismaClient,
      gateway,
      environment,
    ),
  };
}

describe("campaign dispatch worker", () => {
  it("sends the saved HTML once and keeps the real unsubscribe placeholder", async () => {
    const f = fixture();
    await f.worker.sendCampaign("campaign");
    await f.worker.sendCampaign("campaign");
    expect(f.state.status).toBe("SENT");
    expect(f.gateway.sendBroadcast).toHaveBeenCalledTimes(1);
    expect(f.gateway.createBroadcast.mock.calls[0]?.[0]).toMatchObject({
      html: expect.stringContaining("{{{RESEND_UNSUBSCRIBE_URL}}}"),
      subject: "Explore 148 photos",
    });
  });
  it.each(["DRAFT", "SENT", "FAILED", "NEEDS_REVIEW"])(
    "never dispatches a %s campaign",
    async (status) => {
      const f = fixture();
      f.state.status = status;
      await f.worker.sendCampaign("campaign");
      expect(f.gateway.sendBroadcast).not.toHaveBeenCalled();
    },
  );
  it("recovers an interrupted dispatch for review without resending", async () => {
    const f = fixture();
    f.state.status = "DISPATCHING";
    await f.worker.sendCampaign("campaign");
    expect(f.state.status).toBe("NEEDS_REVIEW");
    expect(f.gateway.sendBroadcast).not.toHaveBeenCalled();
  });
  it("requires the production dispatch flag", async () => {
    const f = fixture();
    f.environment.EMAIL_CAMPAIGNS_ENABLED = false;
    await f.worker.sendCampaign("campaign");
    expect(f.state.lastErrorCode).toBe("CAMPAIGNS_DISABLED");
    expect(f.gateway.sendBroadcast).not.toHaveBeenCalled();
  });
  it("waits for import completion without sending", async () => {
    const f = fixture();
    f.gateway.getContactImportStatus.mockResolvedValue("queued" as never);
    await expect(f.worker.sendCampaign("campaign")).rejects.toThrow(
      "CONTACT_IMPORT_PENDING",
    );
    expect(f.state.status).toBe("PREPARING");
    expect(f.gateway.sendBroadcast).not.toHaveBeenCalled();
  });
  it("excludes provider opt-outs without resubscribing", async () => {
    const f = fixture();
    f.gateway.listSegmentContacts.mockResolvedValue(
      f.people.map((row, index) => ({
        email: row.email,
        unsubscribed: index === 1,
      })),
    );
    await f.worker.sendCampaign("campaign");
    expect(f.state.status).toBe("SENT");
    expect(f.state.recipientCount).toBe(1);
    expect(f.gateway.updateContactSubscription).not.toHaveBeenCalled();
  });
  it("removes contacts who opted out while the import was running", async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValue([f.people[0]!]);
    f.gateway.listSegmentContacts
      .mockResolvedValueOnce(
        f.people.map((row) => ({ email: row.email, unsubscribed: false })),
      )
      .mockResolvedValue([{ email: f.people[0]!.email, unsubscribed: false }]);
    await f.worker.sendCampaign("campaign");
    expect(f.gateway.removeContactFromSegment).toHaveBeenCalledWith(
      "segment",
      "two@example.test",
    );
    expect(f.state.status).toBe("SENT");
    expect(f.state.recipientCount).toBe(1);
  });
  it("fails closed if the provider omitted an eligible contact", async () => {
    const f = fixture();
    f.gateway.listSegmentContacts.mockResolvedValue([
      { email: "one@example.test", unsubscribed: false },
    ]);
    await f.worker.sendCampaign("campaign");
    expect(f.state.lastErrorCode).toBe("PROVIDER_AUDIENCE_MISMATCH");
    expect(f.gateway.sendBroadcast).not.toHaveBeenCalled();
  });
  it("fails closed if eligibility changes during provider preparation", async () => {
    const f = fixture();
    f.prisma.$queryRaw.mockResolvedValueOnce(f.people).mockResolvedValue([]);
    await f.worker.sendCampaign("campaign");
    expect(f.state.lastErrorCode).toBe("AUDIENCE_CHANGED_DURING_PREPARATION");
    expect(f.gateway.sendBroadcast).not.toHaveBeenCalled();
  });
  it("uses an atomic dispatch claim to stop competing workers", async () => {
    const f = fixture();
    await Promise.all([
      f.worker.sendCampaign("campaign"),
      f.worker.sendCampaign("campaign"),
    ]);
    expect(f.gateway.sendBroadcast).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    "records provider failure (ambiguous=%s) and never retries dispatch",
    async (ambiguous) => {
      const f = fixture();
      f.gateway.sendBroadcast.mockRejectedValue(
        new EmailProviderError("PROVIDER_FAILURE", ambiguous),
      );
      await f.worker.sendCampaign("campaign");
      await f.worker.sendCampaign("campaign");
      expect(f.state.status).toBe(ambiguous ? "NEEDS_REVIEW" : "FAILED");
      expect(f.gateway.sendBroadcast).toHaveBeenCalledTimes(1);
    },
  );
  it("records an accepted send with a failed database write as needing review", async () => {
    const f = fixture();
    f.prisma.emailCampaign.update.mockImplementation(async ({ data }) => {
      if (data.status === "SENT") throw new Error("Database unavailable");
      return Object.assign(f.state, data);
    });
    await f.worker.sendCampaign("campaign");
    expect(f.state.status).toBe("NEEDS_REVIEW");
  });
});
