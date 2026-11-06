import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "@/modules/auth";
import { EmailCenterService } from "@/modules/email/application/email-center";
import { PrismaEmailCenterRepository } from "@/modules/email/infrastructure/prisma-email-center-repository";
import {
  EmailApplicationError,
  EmailProviderError,
} from "@/modules/email/domain/errors";
import { EmailJobProcessor } from "@/modules/email/infrastructure/email-job-processor";
import { emailContentDigest } from "@/modules/email/application/rendering";
import type { ServerEnvironment } from "@/platform/config/env";
import { createIntegrationClient } from "./support/database";
import { createCampaignListing } from "../support/campaign-fixture";
import { administratorMfaProof } from "./support/admin-mfa-fixtures";

const prisma = createIntegrationClient();
const repository = new PrismaEmailCenterRepository(prisma);
const gateway = {
  send: vi.fn(),
  checkCampaignAccess: vi.fn().mockResolvedValue(undefined),
  createSegment: vi.fn(),
  importContacts: vi.fn(),
  getContactImportStatus: vi.fn(),
  listSegmentContacts: vi.fn(),
  removeContactFromSegment: vi.fn(),
  createBroadcast: vi.fn(),
  sendBroadcast: vi.fn(),
  updateContactSubscription: vi.fn(),
};
const center = new EmailCenterService(
  repository,
  gateway,
  "https://example.test",
  true,
);
const sourceTag = `draft-${randomUUID()}`;
const html =
  '<h1>Simply Decorated spotlight</h1><p>148 photos</p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>';
let session: CurrentSession;
let listingId: string;
let subscribedEmail: string;
const input = () => ({
  name: "Simply Decorated draft",
  subject: "Explore the photos",
  previewText: "A sale spotlight",
  draftHtml: html,
  listingIds: [listingId],
  selectionMode: "CONTACT_SEGMENT" as const,
  contactCategory: "ATTENDEE" as const,
  contactSourceTag: sourceTag,
  selectedUserIds: [],
});

beforeAll(async () => {
  const email = `${randomUUID()}@example.test`;
  const administrator =
    (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } })) ??
    (await prisma.user.create({
      data: {
        displayName: "Campaign administrator",
        email,
        normalizedEmail: email,
        passwordHash: "fixture-only",
        role: "SUPER_ADMIN",
        emailVerifiedAt: new Date(),
      },
    }));
  const stored = await prisma.session.create({
    data: {
      userId: administrator.id,
      tokenHash: randomBytes(32).toString("hex"),
      passwordAuthenticatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      ...(await administratorMfaProof(prisma, administrator.id)),
    },
  });
  session = { ...stored, principal: administrator, metadata: {} };
  listingId = (await createCampaignListing(prisma, administrator.id)).id;
  subscribedEmail = `${randomUUID()}@example.test`;
  const blockedEmail = `${randomUUID()}@example.test`;
  await prisma.user.create({
    data: {
      displayName: "Account opt out",
      email: blockedEmail,
      normalizedEmail: blockedEmail,
      passwordHash: "fixture-only",
      marketingPreference: { create: { unsubscribedAt: new Date() } },
    },
  });
  await prisma.audienceContact.createMany({
    data: [
      { email: subscribedEmail, status: "SUBSCRIBED", category: "ATTENDEE" },
      {
        email: `${randomUUID()}@example.test`,
        status: "UNSUBSCRIBED",
        category: "ATTENDEE",
      },
      {
        email: `${randomUUID()}@example.test`,
        status: "CLEANED",
        category: "ATTENDEE",
      },
      { email: blockedEmail, status: "SUBSCRIBED", category: "ATTENDEE" },
      {
        email: `${randomUUID()}@example.test`,
        status: "SUBSCRIBED",
        category: "BUSINESS_OWNER",
      },
    ].map((row) => ({
      ...row,
      sourceTags: [sourceTag],
      consentConfirmedAt: new Date(),
    })),
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("imported-contact campaign drafts", () => {
  it("saves HTML and the exact contact group without recipients, jobs or provider calls", async () => {
    const before = await prisma.durableJob.count();
    const { id } = await center.createCampaign(session, input());
    const campaign = await center.getCampaign(session, id);
    expect(campaign).toMatchObject({
      status: "DRAFT",
      draftHtml: html,
      templateRevisionId: null,
      selectionMode: "CONTACT_SEGMENT",
      contactCategory: "ATTENDEE",
      contactSourceTag: sourceTag,
      testedAt: null,
      sentAt: null,
      recipients: [],
      contactAudience: { total: 4, eligible: 1, suppressed: 3 },
    });
    expect(await prisma.durableJob.count()).toBe(before);
    expect(gateway.send).not.toHaveBeenCalled();
    await expect(
      center.sendCampaign(session, id, {
        expectedVersion: 1,
        confirmation: "SEND",
      }),
    ).rejects.toMatchObject({ code: "TEST_SEND_REQUIRED" });
    const worker = new EmailJobProcessor(prisma, gateway, {
      APP_ENV: "production",
      EMAIL_CAMPAIGNS_ENABLED: true,
      RESEND_RESOURCE_ENV: "production",
    } as ServerEnvironment);
    await worker.sendCampaign(id);
    expect(gateway.createBroadcast).not.toHaveBeenCalled();
    expect(gateway.createSegment).not.toHaveBeenCalled();
    expect((await center.getCampaign(session, id))?.status).toBe("DRAFT");
  });

  it("recounts current eligibility and saves changed category/source with optimistic locking", async () => {
    const { id } = await center.createCampaign(session, input());
    await prisma.audienceContact.update({
      where: { email: subscribedEmail },
      data: { status: "UNSUBSCRIBED", suppressedAt: new Date() },
    });
    expect(
      (await center.getCampaign(session, id))?.contactAudience,
    ).toMatchObject({ eligible: 0, suppressed: 4 });
    await center.updateCampaign(session, id, {
      expectedVersion: 1,
      name: "Business draft",
      subject: "Saved only",
      contactCategory: "BUSINESS_OWNER",
      contactSourceTag: sourceTag,
      draftHtml: html,
    });
    expect(await center.getCampaign(session, id)).toMatchObject({
      version: 2,
      status: "DRAFT",
      contactAudience: { category: "BUSINESS_OWNER", total: 1, eligible: 1 },
    });
    await expect(
      center.updateCampaign(session, id, {
        expectedVersion: 1,
        name: "Stale",
        subject: "Stale",
      }),
    ).rejects.toMatchObject({ code: "STALE_CAMPAIGN" });
  });

  it("rejects unsafe content, unknown audiences, mixed audiences and revoked sessions", async () => {
    await expect(
      center.createCampaign(session, {
        ...input(),
        draftHtml: "<script>alert(1)</script>",
      }),
    ).rejects.toMatchObject({ code: "UNSAFE_HTML" });
    await expect(
      center.createCampaign(session, {
        ...input(),
        draftHtml: "<h1>No unsubscribe</h1>",
      }),
    ).rejects.toMatchObject({ code: "MISSING_TEMPLATE_VARIABLE" });
    await expect(
      center.createCampaign(session, {
        ...input(),
        contactSourceTag: "missing-group",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTACT_AUDIENCE" });
    await expect(
      center.createCampaign(session, {
        ...input(),
        selectedUserIds: [session.userId],
      }),
    ).rejects.toThrow();
    await expect(
      center.createCampaign({ ...session, id: randomUUID() }, input()),
    ).rejects.toMatchObject({ name: "AuthorizationError" });
  });

  it("retains published-template drafts for registered-user campaigns", async () => {
    const templateHtml =
      '<p>{{{RECENT_LISTINGS_HTML}}}</p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>';
    const digest = emailContentDigest("Published template", templateHtml);
    const template = await prisma.emailTemplate.create({
      data: {
        name: "Template fixture",
        category: "MARKETING",
        draftSubject: "Published template",
        draftHtml: templateHtml,
        draftDigest: digest,
        createdByUserId: session.userId,
      },
    });
    const revision = await prisma.emailTemplateRevision.create({
      data: {
        templateId: template.id,
        revisionNumber: 1,
        subject: "Published template",
        html: templateHtml,
        contentDigest: digest,
        requiredVariables: ["RECENT_LISTINGS_HTML", "RESEND_UNSUBSCRIBE_URL"],
        publishedByUserId: session.userId,
        publishedAt: new Date(),
      },
    });
    await prisma.emailTemplate.update({
      where: { id: template.id },
      data: { activeRevisionId: revision.id },
    });
    const campaign = await center.createCampaign(session, {
      name: "Registered audience",
      subject: "Fresh finds",
      templateRevisionId: revision.id,
      listingIds: [listingId],
      selectionMode: "ALL_ELIGIBLE",
      selectedUserIds: [],
    });
    expect(await center.getCampaign(session, campaign.id)).toMatchObject({
      status: "DRAFT",
      draftHtml: null,
      templateRevisionId: revision.id,
      contactAudience: null,
    });
  });

  it("sends only the saved draft to one test address and leaves bulk dispatch untouched", async () => {
    gateway.send.mockResolvedValueOnce({ id: "preview-provider-id" });
    const beforeJobs = await prisma.durableJob.count();
    const { id } = await center.createCampaign(session, input());
    const preview = {
      recipient: "preview@example.test",
      expectedVersion: 1,
      previewId: randomUUID(),
    };
    await expect(
      center.previewCampaignDraft(session, id, preview),
    ).resolves.toMatchObject({
      providerMessageId: "preview-provider-id",
      recipient: preview.recipient,
      version: 1,
    });
    const message = gateway.send.mock.calls.at(-1)![0];
    expect(message.to).toBe("preview@example.test");
    expect(message.subject).toBe("[Test] Explore the photos");
    expect(message.html).toContain("148 photos");
    expect(message.html).toContain(
      'href="https://example.test/unsubscribe?token=sample"',
    );
    expect(message.html).not.toContain("{{");
    expect(message.idempotencyKey).toContain(preview.previewId);
    expect(
      await prisma.emailCampaign.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({
      status: "DRAFT",
      version: 1,
      testedAt: expect.any(Date),
      sentAt: null,
      providerBroadcastId: null,
      providerSegmentId: null,
    });
    expect(
      await prisma.emailCampaignRecipient.count({ where: { campaignId: id } }),
    ).toBe(0);
    expect(await prisma.durableJob.count()).toBe(beforeJobs);
    expect(gateway.createBroadcast).not.toHaveBeenCalled();
    expect(gateway.sendBroadcast).not.toHaveBeenCalled();
  });

  it("rejects unauthorized, multi-recipient and stale previews and reuses the provider key on retry", async () => {
    const { id } = await center.createCampaign(session, input());
    const preview = {
      recipient: "preview@example.test",
      expectedVersion: 1,
      previewId: randomUUID(),
    };
    gateway.send.mockClear();
    await expect(
      center.previewCampaignDraft(null, id, preview),
    ).rejects.toThrow();
    await expect(
      center.previewCampaignDraft(
        { ...session, principal: { ...session.principal, role: "USER" } },
        id,
        preview,
      ),
    ).rejects.toThrow();
    await expect(
      center.previewCampaignDraft(session, id, {
        ...preview,
        recipient: "one@example.test,two@example.test",
      }),
    ).rejects.toThrow();
    await expect(
      center.previewCampaignDraft(session, id, {
        ...preview,
        expectedVersion: 5,
      }),
    ).rejects.toMatchObject({ code: "STALE_CAMPAIGN" });
    expect(gateway.send).not.toHaveBeenCalled();
    gateway.send.mockRejectedValueOnce(
      new Error("Ambiguous provider response"),
    );
    await expect(
      center.previewCampaignDraft(session, id, preview),
    ).rejects.toThrow("Ambiguous provider response");
    gateway.send.mockResolvedValueOnce({ id: "same-preview-id" });
    await center.previewCampaignDraft(session, id, preview);
    expect(gateway.send.mock.calls[0]![0].idempotencyKey).toBe(
      gateway.send.mock.calls[1]![0].idempotencyKey,
    );
    expect((await center.getCampaign(session, id))?.status).toBe("DRAFT");
  });
  it("snapshots only eligible attendees, tests the exact version, and queues once", async () => {
    const tag = `send-${randomUUID()}`;
    const contacts = await Promise.all(
      ["SUBSCRIBED", "UNSUBSCRIBED", "CLEANED"].map((status) =>
        prisma.audienceContact.create({
          data: {
            email: `${randomUUID()}@example.test`,
            category: "ATTENDEE",
            sourceTags: [tag],
            status,
            consentConfirmedAt: new Date(),
          },
        }),
      ),
    );
    await prisma.audienceContact.create({
      data: {
        email: `${randomUUID()}@example.test`,
        category: "BUSINESS_OWNER",
        sourceTags: [tag],
        status: "SUBSCRIBED",
        consentConfirmedAt: new Date(),
      },
    });
    const { id } = await center.createCampaign(session, {
      ...input(),
      contactSourceTag: tag,
    });
    gateway.send.mockResolvedValue({ id: "test-id" });
    await center.testCampaign(session, id);
    await center.updateCampaign(session, id, {
      expectedVersion: 1,
      name: "Updated",
      subject: "Updated",
      draftHtml: html,
    });
    await expect(
      center.sendCampaign(session, id, {
        expectedVersion: 2,
        confirmation: "SEND",
      }),
    ).rejects.toMatchObject({ code: "TEST_SEND_REQUIRED" });
    await expect(
      repository.markCampaignTested(id, session.userId, session.id, 1),
    ).rejects.toThrow();
    await center.testCampaign(session, id);
    await expect(
      center.sendCampaign(session, id, {
        expectedVersion: 1,
        confirmation: "SEND",
      }),
    ).rejects.toMatchObject({ code: "STALE_CAMPAIGN" });
    expect(() =>
      center.sendCampaign(session, id, {
        expectedVersion: 2,
        confirmation: "WRONG",
      }),
    ).toThrowError("Type SEND to confirm.");
    gateway.checkCampaignAccess.mockRejectedValueOnce(
      new EmailApplicationError(
        "CAMPAIGN_PROVIDER_ACCESS_DENIED",
        "Restricted",
        503,
      ),
    );
    await expect(
      center.sendCampaign(session, id, {
        expectedVersion: 2,
        confirmation: "SEND",
      }),
    ).rejects.toMatchObject({ code: "CAMPAIGN_PROVIDER_ACCESS_DENIED" });
    expect(await center.getCampaign(session, id)).toMatchObject({
      status: "DRAFT",
      version: 2,
    });
    expect(
      await prisma.durableJob.count({ where: { deduplicationKey: id } }),
    ).toBe(0);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        center.sendCampaign(session, id, {
          expectedVersion: 2,
          confirmation: "SEND",
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.emailCampaignContactRecipient.findMany({
        where: { campaignId: id },
      }),
    ).toMatchObject([
      { contactId: contacts[0]!.id, email: contacts[0]!.email },
    ]);
    expect(
      await prisma.durableJob.count({ where: { deduplicationKey: id } }),
    ).toBe(1);
    expect(await center.getCampaign(session, id)).toMatchObject({
      status: "PREPARING",
      version: 3,
      recipientCount: 1,
    });
    await expect(
      prisma.emailCampaignContactRecipient.updateMany({
        where: { campaignId: id },
        data: { email: "other@example.test" },
      }),
    ).rejects.toThrow();

    const worker = new EmailJobProcessor(prisma, gateway, {
      APP_ENV: "production",
      EMAIL_CAMPAIGNS_ENABLED: true,
      RESEND_RESOURCE_ENV: "production",
      APP_URL: "https://example.test",
    } as ServerEnvironment);
    gateway.createSegment.mockRejectedValueOnce(
      new EmailProviderError("SEGMENT_CREATE_FAILED"),
    );
    await worker.sendCampaign(id);
    expect(await center.getCampaign(session, id)).toMatchObject({
      status: "FAILED",
      canRetryPreparation: true,
      version: 3,
      sentAt: null,
    });
    await prisma.audienceContact.create({
      data: {
        email: `${randomUUID()}@example.test`,
        category: "ATTENDEE",
        sourceTags: [tag],
        status: "SUBSCRIBED",
        consentConfirmedAt: new Date(),
      },
    });
    expect(
      await center.sendCampaign(session, id, {
        expectedVersion: 3,
        confirmation: "SEND",
      }),
    ).toEqual({ recipientCount: 1 });
    expect(await center.getCampaign(session, id)).toMatchObject({
      status: "PREPARING",
      version: 4,
      lastErrorCode: null,
    });
    expect(
      await prisma.durableJob.count({ where: { deduplicationKey: `${id}:4` } }),
    ).toBe(1);
    gateway.createSegment.mockResolvedValue({ id: `segment-${id}` });
    gateway.importContacts.mockResolvedValue({ id: `import-${id}` });
    gateway.getContactImportStatus.mockResolvedValue("completed");
    gateway.listSegmentContacts.mockResolvedValue([
      { email: contacts[0]!.email, unsubscribed: false },
    ]);
    gateway.createBroadcast.mockResolvedValue({ id: `broadcast-${id}` });
    gateway.sendBroadcast.mockResolvedValue(undefined);
    await expect(worker.sendCampaign(id)).rejects.toThrow(
      "CONTACT_IMPORT_PENDING",
    );
    await worker.sendCampaign(id);
    expect(gateway.importContacts.mock.calls.at(-1)![0].rows).toHaveLength(1);
    expect(gateway.createBroadcast.mock.calls.at(-1)![0].html).toContain(
      "148 photos",
    );
    expect(gateway.createBroadcast.mock.calls.at(-1)![0].html).toContain(
      "{{{RESEND_UNSUBSCRIBE_URL}}}",
    );
    expect(await center.getCampaign(session, id)).toMatchObject({
      status: "SENT",
      recipientCount: 1,
    });
    const calls = gateway.sendBroadcast.mock.calls.length;
    await worker.sendCampaign(id);
    expect(gateway.sendBroadcast).toHaveBeenCalledTimes(calls);
  });
});
