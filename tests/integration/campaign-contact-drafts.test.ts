import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "@/modules/auth";
import { EmailCenterService } from "@/modules/email/application/email-center";
import { PrismaEmailCenterRepository } from "@/modules/email/infrastructure/prisma-email-center-repository";
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
  createSegment: vi.fn(),
  importContacts: vi.fn(),
  getContactImportStatus: vi.fn(),
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
    await expect(center.testCampaign(session, id)).rejects.toMatchObject({
      code: "DRAFT_ONLY_CAMPAIGN",
    });
    await expect(
      center.sendCampaign(session, id, {
        expectedVersion: 1,
        confirmation: "SEND",
      }),
    ).rejects.toMatchObject({ code: "DRAFT_ONLY_CAMPAIGN" });
    const worker = new EmailJobProcessor(prisma, gateway, {
      APP_ENV: "production",
      EMAIL_CAMPAIGNS_ENABLED: true,
      RESEND_RESOURCE_ENV: "production",
    } as ServerEnvironment);
    await worker.sendCampaign(id);
    expect(gateway.createBroadcast).not.toHaveBeenCalled();
    expect(gateway.createSegment).not.toHaveBeenCalled();
    await expect(
      prisma.emailCampaign.update({
        where: { id },
        data: { status: "PREPARING" },
      }),
    ).rejects.toThrow();
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
});
