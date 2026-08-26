import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import type {
  MarketingPreferenceProjection,
  MarketingPreferenceRepository,
} from "../application/marketing-preference-service";
import type { AuditContext } from "../application/ports";
import {
  hasExplicitMarketingConsent,
  MARKETING_CONSENT_VERSION,
} from "../application/marketing-preference-service";

function projection(
  value: {
    consentAt: Date | null;
    consentVersion: string | null;
    consentSource: "SIGNUP" | "ACCOUNT_SETTINGS" | null;
    unsubscribedAt: Date | null;
  },
  eligible = false,
): MarketingPreferenceProjection {
  return { ...value, eligible };
}

export class PrismaMarketingPreferenceRepository implements MarketingPreferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(userId: string) {
    const value = await this.prisma.marketingPreference.findUnique({
      where: { userId },
    });
    return value ? projection(value, hasExplicitMarketingConsent(value)) : null;
  }

  async update(
    userId: string,
    subscribed: boolean,
    now: Date,
    audit: AuditContext,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.marketingPreference.findUnique({
        where: { userId },
      });
      const value = subscribed
        ? await transaction.marketingPreference.upsert({
            where: { userId },
            create: {
              userId,
              consentAt: now,
              consentVersion: MARKETING_CONSENT_VERSION,
              consentSource: "ACCOUNT_SETTINGS",
              unsubscribedAt: null,
            },
            update: {
              consentAt: now,
              consentVersion: MARKETING_CONSENT_VERSION,
              consentSource: "ACCOUNT_SETTINGS",
              unsubscribedAt: null,
            },
          })
        : await transaction.marketingPreference.upsert({
            where: { userId },
            create: {
              userId,
              consentAt: null,
              consentVersion: null,
              consentSource: null,
              unsubscribedAt: now,
            },
            update: { unsubscribedAt: now },
          });
      const action = subscribed
        ? existing?.consentAt
          ? "MARKETING_RESUBSCRIBED"
          : "MARKETING_CONSENT_GIVEN"
        : "MARKETING_UNSUBSCRIBED";
      await transaction.auditEntry.create({
        data: {
          actorUserId: userId,
          action,
          targetType: "USER",
          targetId: userId,
          requestId: audit.requestId ?? null,
          metadata: subscribed
            ? {
                consentVersion: MARKETING_CONSENT_VERSION,
                consentSource: "ACCOUNT_SETTINGS",
              }
            : {},
        },
      });
      await transaction.durableJob.create({
        data: {
          queue: "email",
          type: "RESEND_CONTACT_SUBSCRIPTION",
          payload: {
            userId,
            subscribed,
            preferenceUpdatedAt: value.updatedAt.toISOString(),
          },
          deduplicationKey: `${userId}:${now.toISOString()}`,
          maxAttempts: 10,
        },
      });
      return projection(value, hasExplicitMarketingConsent(value));
    });
  }
}
