import "server-only";

import { MARKETING_CONSENT_VERSION } from "@/modules/auth";

import type { PrismaClient } from "@/generated/prisma/client";

import { EmailApplicationError } from "../domain/errors";
import {
  assertRequiredVariables,
  emailContentDigest,
  sanitizeEmailHtml,
} from "../application/rendering";
import { SYSTEM_EMAIL_DEFAULTS } from "../application/defaults";

const templateSelect = {
  id: true,
  key: true,
  name: true,
  category: true,
  draftSubject: true,
  draftHtml: true,
  draftDigest: true,
  draftVersion: true,
  lastTestedDigest: true,
  lastTestedAt: true,
  archivedAt: true,
  updatedAt: true,
  activeRevision: { select: { id: true, revisionNumber: true } },
  revisions: {
    orderBy: { revisionNumber: "desc" as const },
    select: {
      id: true,
      revisionNumber: true,
      subject: true,
      contentDigest: true,
      publishedAt: true,
    },
  },
};

function templateRequiredVariables(
  key: keyof typeof SYSTEM_EMAIL_DEFAULTS | null,
) {
  return key
    ? [...SYSTEM_EMAIL_DEFAULTS[key].requiredVariables]
    : ["RECENT_LISTINGS_HTML", "RESEND_UNSUBSCRIBE_URL"];
}

export class PrismaEmailCenterRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listTemplates() {
    return this.prisma.emailTemplate.findMany({
      orderBy: [
        { archivedAt: "asc" },
        { category: "asc" },
        { updatedAt: "desc" },
      ],
      select: templateSelect,
    });
  }

  getTemplate(id: string) {
    return this.prisma.emailTemplate.findUnique({
      where: { id },
      select: templateSelect,
    });
  }

  async createTemplate(input: {
    name: string;
    subject: string;
    html: string;
    actorId: string;
    requestId?: string;
  }) {
    const html = sanitizeEmailHtml(input.html);
    const digest = emailContentDigest(input.subject, html);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.emailTemplate.create({
        data: {
          name: input.name,
          category: "MARKETING",
          draftSubject: input.subject,
          draftHtml: html,
          draftDigest: digest,
          createdByUserId: input.actorId,
        },
        select: { id: true },
      });
      await tx.auditEntry.create({
        data: {
          actorUserId: input.actorId,
          action: "EMAIL_TEMPLATE_CREATED",
          targetType: "EMAIL_TEMPLATE",
          targetId: created.id,
          requestId: input.requestId ?? null,
        },
      });
      return created;
    });
  }

  async saveDraft(input: {
    id: string;
    subject: string;
    html: string;
    expectedVersion: number;
  }) {
    const html = sanitizeEmailHtml(input.html);
    const digest = emailContentDigest(input.subject, html);
    const updated = await this.prisma.emailTemplate.updateMany({
      where: {
        id: input.id,
        draftVersion: input.expectedVersion,
        archivedAt: null,
      },
      data: {
        draftSubject: input.subject,
        draftHtml: html,
        draftDigest: digest,
        draftVersion: { increment: 1 },
        lastTestedAt: null,
        lastTestedDigest: null,
      },
    });
    if (!updated.count)
      throw new EmailApplicationError(
        "STALE_DRAFT",
        "This draft changed. Reload it before saving again.",
        409,
      );
    return this.getTemplate(input.id);
  }

  async markTested(input: {
    id: string;
    digest: string;
    testedAt: Date;
    actorId: string;
    requestId?: string;
  }) {
    const updated = await this.prisma.emailTemplate.updateMany({
      where: { id: input.id, draftDigest: input.digest, archivedAt: null },
      data: { lastTestedDigest: input.digest, lastTestedAt: input.testedAt },
    });
    if (!updated.count)
      throw new EmailApplicationError(
        "STALE_DRAFT",
        "The draft changed before the test completed.",
        409,
      );
    await this.prisma.auditEntry.create({
      data: {
        actorUserId: input.actorId,
        action: "EMAIL_TEMPLATE_TESTED",
        targetType: "EMAIL_TEMPLATE",
        targetId: input.id,
        requestId: input.requestId ?? null,
        metadata: { contentDigest: input.digest },
      },
    });
  }

  async publish(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
    now: Date;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const template = await tx.emailTemplate.findUnique({
          where: { id: input.id },
          include: {
            revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
          },
        });
        if (!template)
          throw new EmailApplicationError(
            "TEMPLATE_NOT_FOUND",
            "Email template not found.",
            404,
          );
        if (template.archivedAt)
          throw new EmailApplicationError(
            "TEMPLATE_ARCHIVED",
            "Archived templates cannot be published.",
            409,
          );
        if (template.draftVersion !== input.expectedVersion)
          throw new EmailApplicationError(
            "STALE_DRAFT",
            "This draft changed. Reload it before publishing.",
            409,
          );
        if (
          !template.lastTestedAt ||
          template.lastTestedDigest !== template.draftDigest ||
          input.now.getTime() - template.lastTestedAt.getTime() > 30 * 60 * 1000
        ) {
          throw new EmailApplicationError(
            "TEST_SEND_REQUIRED",
            "Send this exact draft as a test within 30 minutes before publishing.",
            409,
          );
        }
        const requiredVariables = templateRequiredVariables(template.key);
        assertRequiredVariables(template.draftHtml, requiredVariables);
        const revision = await tx.emailTemplateRevision.create({
          data: {
            templateId: template.id,
            revisionNumber: (template.revisions[0]?.revisionNumber ?? 0) + 1,
            subject: template.draftSubject,
            html: template.draftHtml,
            contentDigest: template.draftDigest,
            requiredVariables,
            publishedByUserId: input.actorId,
            publishedAt: input.now,
          },
        });
        await tx.emailTemplate.update({
          where: { id: template.id },
          data: { activeRevisionId: revision.id },
        });
        await tx.auditEntry.create({
          data: {
            actorUserId: input.actorId,
            action: "EMAIL_TEMPLATE_PUBLISHED",
            targetType: "EMAIL_TEMPLATE",
            targetId: template.id,
            requestId: input.requestId ?? null,
            metadata: {
              revisionNumber: revision.revisionNumber,
              contentDigest: revision.contentDigest,
            },
          },
        });
        return revision;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async rollback(input: {
    id: string;
    revisionId: string;
    actorId: string;
    requestId?: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const revision = await tx.emailTemplateRevision.findFirst({
        where: { id: input.revisionId, templateId: input.id },
      });
      if (!revision)
        throw new EmailApplicationError(
          "REVISION_NOT_FOUND",
          "Published revision not found.",
          404,
        );
      await tx.emailTemplate.update({
        where: { id: input.id, archivedAt: null },
        data: { activeRevisionId: revision.id },
      });
      await tx.auditEntry.create({
        data: {
          actorUserId: input.actorId,
          action: "EMAIL_TEMPLATE_ROLLED_BACK",
          targetType: "EMAIL_TEMPLATE",
          targetId: input.id,
          requestId: input.requestId ?? null,
          metadata: { revisionNumber: revision.revisionNumber },
        },
      });
    });
  }

  async archive(input: { id: string; actorId: string; requestId?: string }) {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id: input.id },
      select: { key: true },
    });
    if (!template)
      throw new EmailApplicationError(
        "TEMPLATE_NOT_FOUND",
        "Email template not found.",
        404,
      );
    if (template.key)
      throw new EmailApplicationError(
        "SYSTEM_TEMPLATE_PROTECTED",
        "System templates cannot be archived.",
        409,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.emailTemplate.update({
        where: { id: input.id },
        data: { archivedAt: new Date() },
      });
      await tx.auditEntry.create({
        data: {
          actorUserId: input.actorId,
          action: "EMAIL_TEMPLATE_ARCHIVED",
          targetType: "EMAIL_TEMPLATE",
          targetId: input.id,
          requestId: input.requestId ?? null,
        },
      });
    });
  }

  listCampaigns() {
    return this.prisma.emailCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        templateRevision: { select: { template: { select: { name: true } } } },
      },
    });
  }

  async campaignComposerOptions() {
    const now = new Date();
    const [templates, listings, users] = await Promise.all([
      this.prisma.emailTemplateRevision.findMany({
        where: {
          activeForTemplate: {
            is: { category: "MARKETING", archivedAt: null },
          },
        },
        select: {
          id: true,
          revisionNumber: true,
          template: { select: { name: true } },
        },
        orderBy: { publishedAt: "desc" },
      }),
      this.prisma.event.findMany({
        where: {
          deletedAt: null,
          canceledAt: null,
          removedAt: null,
          endsAt: { gt: now },
          publication: { isNot: null },
        },
        take: 20,
        orderBy: { publication: { publishedAt: "desc" } },
        select: {
          id: true,
          title: true,
          eventType: true,
          startsAt: true,
          endsAt: true,
          publicId: true,
          slug: true,
          location: { select: { city: true } },
          publication: { select: { canonicalPath: true } },
        },
      }),
      this.prisma.user.findMany({
        where: {
          role: "USER",
          status: "ACTIVE",
          emailVerifiedAt: { not: null },
          marketingPreference: {
            is: {
              consentAt: { not: null },
              consentVersion: MARKETING_CONSENT_VERSION,
              consentSource: { not: null },
              unsubscribedAt: null,
            },
          },
        },
        take: 100,
        orderBy: { createdAt: "desc" },
        select: { id: true, displayName: true, email: true },
      }),
    ]);
    return { templates, listings, users };
  }

  async createCampaign(input: {
    name: string;
    subject: string;
    previewText?: string;
    templateRevisionId: string;
    listingIds: string[];
    selectionMode: "ALL_ELIGIBLE" | "SELECTED_USERS";
    selectedUserIds: string[];
    actorId: string;
    requestId?: string;
  }) {
    const options = await this.campaignComposerOptions();
    const listingMap = new Map(
      options.listings.map((listing) => [listing.id, listing]),
    );
    const selected = input.listingIds
      .map((id) => listingMap.get(id))
      .filter((value) => value !== undefined);
    if (
      selected.length !== input.listingIds.length ||
      selected.length < 1 ||
      selected.length > 6
    )
      throw new EmailApplicationError(
        "INVALID_LISTINGS",
        "Choose one to six active public listings.",
        409,
      );
    const snapshot = selected.map((listing) => ({
      eventId: listing.id,
      title: listing.title ?? "Estate sale",
      path: listing.publication!.canonicalPath,
      startsAt: listing.startsAt!.toISOString(),
      endsAt: listing.endsAt!.toISOString(),
      city: listing.location?.city ?? "Bakersfield",
      type: listing.eventType,
    }));
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.emailCampaign.create({
        data: {
          name: input.name,
          subject: input.subject,
          previewText: input.previewText ?? null,
          selectionMode: input.selectionMode,
          templateRevisionId: input.templateRevisionId,
          listingSnapshot: snapshot,
          createdByUserId: input.actorId,
        },
        select: { id: true },
      });
      if (input.selectionMode === "SELECTED_USERS") {
        const eligibleIds = new Set(options.users.map((user) => user.id));
        const ids = [...new Set(input.selectedUserIds)].filter((id) =>
          eligibleIds.has(id),
        );
        if (!ids.length)
          throw new EmailApplicationError(
            "RECIPIENTS_REQUIRED",
            "Select at least one eligible user.",
            400,
          );
        await tx.emailCampaignRecipient.createMany({
          data: ids.map((userId) => ({ campaignId: created.id, userId })),
        });
      }
      await tx.auditEntry.create({
        data: {
          actorUserId: input.actorId,
          action: "EMAIL_CAMPAIGN_CREATED",
          targetType: "EMAIL_CAMPAIGN",
          targetId: created.id,
          requestId: input.requestId ?? null,
          metadata: {
            selectionMode: input.selectionMode,
            listingCount: snapshot.length,
          },
        },
      });
      return created;
    });
  }

  async updateCampaign(input: {
    id: string;
    expectedVersion: number;
    name: string;
    subject: string;
    previewText?: string;
    actorId: string;
    requestId?: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.emailCampaign.updateMany({
        where: {
          id: input.id,
          status: "DRAFT",
          version: input.expectedVersion,
        },
        data: {
          name: input.name,
          subject: input.subject,
          previewText: input.previewText ?? null,
          version: { increment: 1 },
          testedAt: null,
        },
      });
      if (!updated.count) {
        throw new EmailApplicationError(
          "STALE_CAMPAIGN",
          "The campaign changed. Reload and try again.",
          409,
        );
      }
      await tx.auditEntry.create({
        data: {
          actorUserId: input.actorId,
          action: "EMAIL_CAMPAIGN_UPDATED",
          targetType: "EMAIL_CAMPAIGN",
          targetId: input.id,
          requestId: input.requestId ?? null,
        },
      });
    });
  }

  getCampaign(id: string) {
    return this.prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        templateRevision: { include: { template: { select: { name: true } } } },
        recipients: {
          include: { user: { select: { displayName: true, email: true } } },
        },
      },
    });
  }

  listDeliveryHistory() {
    return this.prisma.emailDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        status: true,
        attempts: true,
        sentAt: true,
        deliveredAt: true,
        failedAt: true,
        createdAt: true,
        user: { select: { displayName: true, email: true } },
        templateRevision: {
          select: {
            revisionNumber: true,
            template: { select: { name: true } },
          },
        },
        paymentAttemptId: true,
      },
    });
  }

  async markCampaignTested(id: string, actorId: string, requestId?: string) {
    await this.prisma.emailCampaign.update({
      where: { id, status: "DRAFT" },
      data: { testedAt: new Date() },
    });
    await this.prisma.auditEntry.create({
      data: {
        actorUserId: actorId,
        action: "EMAIL_CAMPAIGN_TESTED",
        targetType: "EMAIL_CAMPAIGN",
        targetId: id,
        requestId: requestId ?? null,
      },
    });
  }

  async prepareCampaign(input: {
    id: string;
    expectedVersion: number;
    actorId: string;
    requestId?: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const campaign = await tx.emailCampaign.findUnique({
          where: { id: input.id },
          include: { recipients: true },
        });
        if (!campaign)
          throw new EmailApplicationError(
            "CAMPAIGN_NOT_FOUND",
            "Email campaign not found.",
            404,
          );
        if (
          campaign.status !== "DRAFT" ||
          campaign.version !== input.expectedVersion
        )
          throw new EmailApplicationError(
            "STALE_CAMPAIGN",
            "The campaign changed. Reload and try again.",
            409,
          );
        if (!campaign.testedAt)
          throw new EmailApplicationError(
            "TEST_SEND_REQUIRED",
            "Send a test before dispatching this campaign.",
            409,
          );
        const eligible = await tx.user.findMany({
          where: {
            role: "USER",
            status: "ACTIVE",
            emailVerifiedAt: { not: null },
            marketingPreference: {
              is: {
                consentAt: { not: null },
                consentVersion: MARKETING_CONSENT_VERSION,
                consentSource: { not: null },
                unsubscribedAt: null,
              },
            },
            ...(campaign.selectionMode === "SELECTED_USERS"
              ? { id: { in: campaign.recipients.map((row) => row.userId) } }
              : {}),
          },
          select: { id: true },
        });
        if (!eligible.length)
          throw new EmailApplicationError(
            "RECIPIENTS_REQUIRED",
            "No eligible recipients remain.",
            409,
          );
        if (eligible.length > 10_000)
          throw new EmailApplicationError(
            "AUDIENCE_TOO_LARGE",
            "Narrow this campaign to 10,000 recipients or fewer.",
            422,
          );
        if (campaign.selectionMode === "ALL_ELIGIBLE")
          await tx.emailCampaignRecipient.createMany({
            data: eligible.map((user) => ({
              campaignId: campaign.id,
              userId: user.id,
            })),
            skipDuplicates: true,
          });
        await tx.emailCampaign.update({
          where: { id: campaign.id },
          data: {
            status: "PREPARING",
            recipientCount: eligible.length,
            version: { increment: 1 },
          },
        });
        await tx.durableJob.create({
          data: {
            queue: "email",
            type: "EMAIL_CAMPAIGN_SEND",
            payload: { campaignId: campaign.id },
            deduplicationKey: campaign.id,
            maxAttempts: 10,
          },
        });
        await tx.auditEntry.create({
          data: {
            actorUserId: input.actorId,
            action: "EMAIL_CAMPAIGN_QUEUED",
            targetType: "EMAIL_CAMPAIGN",
            targetId: campaign.id,
            requestId: input.requestId ?? null,
            metadata: { recipientCount: eligible.length },
          },
        });
        return { recipientCount: eligible.length };
      },
      { isolationLevel: "Serializable" },
    );
  }
}
