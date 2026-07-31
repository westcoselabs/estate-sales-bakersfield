import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import type { AdminCursor, AdminUserFilter } from "../domain/types";
import { AdminConflictError, AdminNotFoundError } from "../domain/errors";

const meaningfulActions = [
  "ACCOUNT_CREATED",
  "LOGIN_SUCCEEDED",
  "SUPER_ADMIN_LOGIN",
  "EMAIL_VERIFIED",
  "EVENT_CREATED",
  "EVENT_UPDATED",
  "EVENT_APPROVED",
  "CHECKOUT_CREATED",
  "PAYMENT_SUCCEEDED",
  "EVENT_PUBLISHED",
  "EVENT_CANCELED",
] as const;

function searchWhere(search: string): Prisma.UserWhereInput {
  if (!search) return {};
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      search,
    )
  ) {
    return { id: search };
  }
  return {
    OR: [
      { displayName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ],
  };
}

function filterWhere(filter: AdminUserFilter): Prisma.UserWhereInput {
  switch (filter) {
    case "verified":
      return { emailVerifiedAt: { not: null } };
    case "unverified":
      return { emailVerifiedAt: null };
    case "published":
      return {
        organizerProfile: {
          events: { some: { publication: { isNot: null } } },
        },
      };
    case "restricted":
      return { status: "RESTRICTED" };
    default:
      return {};
  }
}

const listInclude = {
  organizerProfile: {
    select: {
      events: {
        select: {
          id: true,
          publication: { select: { id: true } },
        },
      },
    },
  },
  paymentAttempts: {
    where: { paymentState: "PAID" as const },
    select: { expectedAmount: true, expectedCurrency: true },
  },
  auditEntries: {
    where: { action: { in: [...meaningfulActions] } },
    orderBy: { occurredAt: "desc" as const },
    take: 1,
    select: { occurredAt: true },
  },
} satisfies Prisma.UserInclude;

export class PrismaAdminUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: {
    search: string;
    filter: AdminUserFilter;
    cursor: AdminCursor | null;
    limit: number;
  }) {
    const cursorWhere: Prisma.UserWhereInput = input.cursor
      ? {
          OR: [
            { createdAt: { lt: input.cursor.at } },
            {
              createdAt: input.cursor.at,
              id: { lt: input.cursor.id },
            },
          ],
        }
      : {};
    const rows = await this.prisma.user.findMany({
      where: {
        AND: [
          searchWhere(input.search),
          filterWhere(input.filter),
          cursorWhere,
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      include: listInclude,
    });
    const hasMore = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    return {
      rows: visible,
      next: hasMore
        ? {
            at: visible.at(-1)!.createdAt,
            id: visible.at(-1)!.id,
          }
        : null,
    };
  }

  async detail(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        marketingPreference: true,
        organizerProfile: {
          select: {
            events: {
              orderBy: { updatedAt: "desc" },
              take: 25,
              include: {
                publication: true,
              },
            },
          },
        },
        paymentAttempts: {
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            eventId: true,
            expectedAmount: true,
            expectedCurrency: true,
            checkoutState: true,
            paymentState: true,
            fulfillmentState: true,
            paidAt: true,
            fulfilledAt: true,
            createdAt: true,
          },
        },
        auditEntries: {
          where: { action: { in: [...meaningfulActions] } },
          orderBy: { occurredAt: "desc" },
          take: 25,
          select: {
            id: true,
            action: true,
            occurredAt: true,
            targetType: true,
            targetId: true,
          },
        },
      },
    });
  }

  async contactExport(search: string, take: number) {
    return this.prisma.user.findMany({
      where: searchWhere(search),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      include: listInclude,
    });
  }

  async restrict(input: {
    targetId: string;
    expectedUpdatedAt: Date;
    reason: string;
    actorId: string;
    requestId?: string;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: input.targetId },
        });
        if (!user) throw new AdminNotFoundError();
        if (user.role === "SUPER_ADMIN") {
          throw new AdminConflictError(
            "PROTECTED_SUPER_ADMIN",
            "The super-admin account is protected.",
          );
        }
        if (user.status !== "ACTIVE") {
          throw new AdminConflictError(
            "INVALID_ACCOUNT_STATE",
            "Only an active account can be restricted.",
          );
        }
        if (user.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
          throw new AdminConflictError(
            "STALE_VERSION",
            "The account changed. Refresh and try again.",
          );
        }
        const updated = await transaction.user.update({
          where: { id: user.id },
          data: {
            status: "RESTRICTED",
            restrictedAt: new Date(),
            restrictionReason: input.reason,
          },
        });
        await transaction.session.deleteMany({ where: { userId: user.id } });
        await transaction.auditEntry.create({
          data: {
            actorUserId: input.actorId,
            action: "USER_RESTRICTED",
            targetType: "USER",
            targetId: user.id,
            requestId: input.requestId ?? null,
            metadata: { reason: input.reason },
          },
        });
        return updated;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async restore(input: {
    targetId: string;
    expectedUpdatedAt: Date;
    actorId: string;
    requestId?: string;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: input.targetId },
        });
        if (!user) throw new AdminNotFoundError();
        if (user.role === "SUPER_ADMIN") {
          throw new AdminConflictError(
            "PROTECTED_SUPER_ADMIN",
            "The super-admin account is protected.",
          );
        }
        if (
          user.status !== "RESTRICTED" ||
          user.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
        ) {
          throw new AdminConflictError(
            "STALE_OR_INVALID_STATE",
            "The account changed or is not restricted.",
          );
        }
        const updated = await transaction.user.update({
          where: { id: user.id },
          data: {
            status: "ACTIVE",
            restrictedAt: null,
            restrictionReason: null,
          },
        });
        await transaction.auditEntry.create({
          data: {
            actorUserId: input.actorId,
            action: "USER_RESTORED",
            targetType: "USER",
            targetId: user.id,
            requestId: input.requestId ?? null,
          },
        });
        return updated;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async revokeSessions(input: {
    targetId: string;
    actorId: string;
    requestId?: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: input.targetId },
        select: { role: true },
      });
      if (!user) throw new AdminNotFoundError();
      if (user.role === "SUPER_ADMIN") {
        throw new AdminConflictError(
          "PROTECTED_SUPER_ADMIN",
          "The super-admin account is protected.",
        );
      }
      const result = await transaction.session.deleteMany({
        where: { userId: input.targetId },
      });
      await transaction.auditEntry.create({
        data: {
          actorUserId: input.actorId,
          action: "USER_SESSIONS_REVOKED",
          targetType: "USER",
          targetId: input.targetId,
          requestId: input.requestId ?? null,
          metadata: { revokedCount: result.count },
        },
      });
      return result.count;
    });
  }

  async findResendTarget(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        email: true,
        normalizedEmail: true,
        emailVerifiedAt: true,
      },
    });
  }

  async auditExport(input: {
    actorId: string;
    requestId: string;
    searched: boolean;
    rowCount: number;
  }) {
    await this.prisma.auditEntry.create({
      data: {
        actorUserId: input.actorId,
        action: "MARKETING_CONTACTS_EXPORTED",
        targetType: "MARKETING_SEGMENT",
        targetId: "ALL_REGISTERED_USERS",
        requestId: input.requestId,
        metadata: {
          segment: "ALL_REGISTERED_USERS",
          searchApplied: input.searched,
          rowCount: input.rowCount,
        },
      },
    });
  }
}
