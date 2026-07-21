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
        select: { id: true },
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
