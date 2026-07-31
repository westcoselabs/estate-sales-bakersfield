import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import type { AdminDateRange } from "../domain/types";

function dateFilter(range: AdminDateRange) {
  return {
    ...(range.from ? { gte: range.from } : {}),
    lt: range.to,
  };
}

export class PrismaOverviewReportingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async metrics(range: AdminDateRange) {
    const paidWhere = {
      paymentState: "PAID" as const,
      paidAt: dateFilter(range),
    };
    const [
      totalUsers,
      newUsers,
      publications,
      canceledListings,
      paid,
      activePublications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: dateFilter(range) } }),
      this.prisma.eventPublication.count({
        where: { publishedAt: dateFilter(range) },
      }),
      this.prisma.event.count({
        where: { canceledAt: dateFilter(range) },
      }),
      this.prisma.paymentAttempt.findMany({
        where: paidWhere,
        select: {
          expectedAmount: true,
          expectedCurrency: true,
          paidAt: true,
        },
      }),
      this.prisma.eventPublication.findMany({
        where: {
          event: {
            deletedAt: null,
            canceledAt: null,
            removedAt: null,
          },
        },
        select: { snapshot: true },
      }),
    ]);
    return {
      totalUsers,
      newUsers,
      publications,
      canceledListings,
      paid,
      activePublications,
    };
  }

  async funnelUsers(range: AdminDateRange) {
    return this.prisma.user.findMany({
      where: {
        role: "USER",
        createdAt: dateFilter(range),
      },
      select: {
        id: true,
        organizerProfile: {
          select: {
            events: {
              select: {
                id: true,
                publication: { select: { id: true } },
                paymentAttempts: {
                  select: {
                    stripeCheckoutSessionId: true,
                    paymentState: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async trend(range: AdminDateRange) {
    return this.prisma.paymentAttempt.findMany({
      where: {
        paymentState: "PAID",
        paidAt: dateFilter(range),
      },
      select: {
        expectedAmount: true,
        expectedCurrency: true,
        paidAt: true,
      },
      orderBy: { paidAt: "asc" },
    });
  }

  async recentActivity() {
    const [payments, users, publications, cancellations] = await Promise.all([
      this.prisma.paymentAttempt.findMany({
        where: { paymentState: "PAID", paidAt: { not: null } },
        orderBy: { paidAt: "desc" },
        take: 5,
        select: {
          id: true,
          paidAt: true,
          user: { select: { id: true, displayName: true } },
          event: { select: { id: true, title: true } },
        },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, displayName: true, createdAt: true },
      }),
      this.prisma.eventPublication.findMany({
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: {
          id: true,
          publishedAt: true,
          event: { select: { id: true, title: true } },
        },
      }),
      this.prisma.event.findMany({
        where: { canceledAt: { not: null } },
        orderBy: { canceledAt: "desc" },
        take: 5,
        select: { id: true, title: true, canceledAt: true },
      }),
    ]);
    return { payments, users, publications, cancellations };
  }

  async warnings() {
    const [reconciliation, webhooks, photos, purgeJobs, paymentAttention] =
      await Promise.all([
        this.prisma.durableJob.count({
          where: {
            type: { contains: "RECONCIL", mode: "insensitive" },
            status: { in: ["FAILED", "DEAD"] },
          },
        }),
        this.prisma.stripeWebhookEvent.count({
          where: { processingState: "FAILED" },
        }),
        this.prisma.eventPhoto.count({
          where: { status: "FAILED", errorCode: { not: "MEDIA_PURGED" } },
        }),
        this.prisma.durableJob.count({
          where: {
            type: "EVENT_MEDIA_PURGE",
            status: { in: ["FAILED", "DEAD"] },
          },
        }),
        this.prisma.paymentAttempt.count({
          where: { fulfillmentState: { in: ["BLOCKED", "MANUAL_REVIEW"] } },
        }),
      ]);
    return {
      reconciliation,
      webhooks,
      photos,
      purgeJobs,
      paymentAttention,
    };
  }
}
