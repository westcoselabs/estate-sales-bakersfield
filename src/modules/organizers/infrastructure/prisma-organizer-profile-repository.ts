import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import type { OrganizerProfileRepository } from "../application/ports";
import type { OrganizerProfile } from "../domain/types";

function mapProfile(
  profile: Awaited<
    ReturnType<PrismaClient["organizerProfile"]["findUniqueOrThrow"]>
  >,
): OrganizerProfile {
  return profile;
}

export class PrismaOrganizerProfileRepository implements OrganizerProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<OrganizerProfile | null> {
    const profile = await this.prisma.organizerProfile.findUnique({
      where: { userId },
    });
    return profile ? mapProfile(profile) : null;
  }

  async saveForUser(
    input: Parameters<OrganizerProfileRepository["saveForUser"]>[0],
  ): Promise<OrganizerProfile> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.organizerProfile.findUnique({
        where: { userId: input.userId },
        select: {
          id: true,
          displayName: true,
          websiteUrl: true,
          status: true,
        },
      });
      const profile = await transaction.organizerProfile.upsert({
        where: { userId: input.userId },
        create: {
          userId: input.userId,
          displayName: input.displayName,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          websiteUrl: input.websiteUrl,
          status: input.status,
        },
        update: {
          displayName: input.displayName,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          websiteUrl: input.websiteUrl,
          status: input.status,
        },
      });
      const changesPublicEventContent =
        existing &&
        (existing.displayName !== input.displayName ||
          existing.websiteUrl !== input.websiteUrl ||
          existing.status !== input.status);
      if (changesPublicEventContent) {
        const affectedEvents = await transaction.event.findMany({
          where: { organizerId: profile.id, publication: { is: null } },
          select: { id: true, approvalStatus: true },
        });
        const approvedIds = affectedEvents
          .filter((event) => event.approvalStatus === "APPROVED")
          .map((event) => event.id);
        const unapprovedIds = affectedEvents
          .filter((event) => event.approvalStatus !== "APPROVED")
          .map((event) => event.id);
        if (approvedIds.length > 0) {
          await transaction.event.updateMany({
            where: { id: { in: approvedIds }, organizerId: profile.id },
            data: {
              version: { increment: 1 },
              contentRevision: { increment: 1 },
              workflowState: "PREVIEW_READY",
              approvalStatus: "NOT_APPROVED",
              approvedRevision: null,
              approvalDigest: null,
              approvedAt: null,
              termsVersion: null,
              termsAcceptedAt: null,
              termsAcceptedByUserId: null,
              currentApprovalId: null,
            },
          });
        }
        if (unapprovedIds.length > 0) {
          await transaction.event.updateMany({
            where: { id: { in: unapprovedIds }, organizerId: profile.id },
            data: {
              version: { increment: 1 },
              contentRevision: { increment: 1 },
            },
          });
        }
        if (affectedEvents.length > 0) {
          await transaction.auditEntry.createMany({
            data: affectedEvents.map((event) => ({
              actorUserId: input.userId,
              action:
                event.approvalStatus === "APPROVED"
                  ? "EVENT_APPROVAL_INVALIDATED"
                  : "EVENT_CONTENT_REVISION_ADVANCED",
              targetType: "EVENT",
              targetId: event.id,
              ...(input.audit.requestId
                ? { requestId: input.audit.requestId }
                : {}),
              metadata: {
                reason: "ORGANIZER_PUBLIC_PROFILE_CHANGED",
              },
            })),
          });
        }
      }
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.userId,
          action: existing
            ? "ORGANIZER_PROFILE_UPDATED"
            : "ORGANIZER_PROFILE_CREATED",
          targetType: "ORGANIZER_PROFILE",
          targetId: profile.id,
          ...(input.audit.requestId
            ? { requestId: input.audit.requestId }
            : {}),
          metadata: { status: profile.status },
        },
      });
      return mapProfile(profile);
    });
  }
}
