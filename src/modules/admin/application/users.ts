import type { AuthPrincipal, CurrentSession } from "@/modules/auth";

import { authorizeAdminService, authorizeRecentAdminService } from "./security";
import { encodeAdminCursor } from "./criteria";
import { encodeMarketingCsv } from "./csv";
import {
  AdminConflictError,
  AdminExportLimitError,
  AdminNotFoundError,
} from "../domain/errors";
import type { PrismaAdminUserRepository } from "../infrastructure/prisma-admin-user-repository";

function totals(
  payments: ReadonlyArray<{
    expectedAmount: number;
    expectedCurrency: string;
  }>,
): Array<{ currency: string; amount: number }> {
  const values = new Map<string, number>();
  for (const payment of payments) {
    values.set(
      payment.expectedCurrency,
      (values.get(payment.expectedCurrency) ?? 0) + payment.expectedAmount,
    );
  }
  return [...values]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount }));
}

function eventLifecycle(event: {
  deletedAt: Date | null;
  canceledAt: Date | null;
  removedAt: Date | null;
}) {
  return event.deletedAt
    ? "DELETED_DRAFT"
    : event.canceledAt
      ? "CANCELED"
      : event.removedAt
        ? "REMOVED"
        : "ACTIVE";
}

export class AdminUserDirectory {
  constructor(private readonly repository: PrismaAdminUserRepository) {}

  async list(
    principal: AuthPrincipal | null,
    criteria: Parameters<PrismaAdminUserRepository["list"]>[0],
  ) {
    authorizeAdminService(principal);
    const result = await this.repository.list(criteria);
    return {
      rows: result.rows.map((user) => {
        const events = user.organizerProfile?.events ?? [];
        return {
          id: user.id,
          name: user.displayName,
          email: user.email,
          verified: user.emailVerifiedAt !== null,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastActivityAt: user.auditEntries[0]?.occurredAt ?? user.createdAt,
          listings: events.length,
          publications: events.filter((event) => event.publication).length,
          purchases: user.paymentAttempts.length,
          spent: totals(user.paymentAttempts),
          status: user.status,
          role: user.role,
        };
      }),
      nextCursor: result.next ? encodeAdminCursor(result.next) : null,
    };
  }
}

export class AdminUserDetail {
  constructor(private readonly repository: PrismaAdminUserRepository) {}

  async get(principal: AuthPrincipal | null, id: string) {
    authorizeAdminService(principal);
    const user = await this.repository.detail(id);
    if (!user) throw new AdminNotFoundError();
    const events = user.organizerProfile?.events ?? [];
    const successful = user.paymentAttempts.filter(
      (payment) => payment.paymentState === "PAID",
    );
    return {
      id: user.id,
      name: user.displayName,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt:
        user.auditEntries.find(
          (entry) =>
            entry.action === "LOGIN_SUCCEEDED" ||
            entry.action === "SUPER_ADMIN_LOGIN",
        )?.occurredAt ?? null,
      lastActivityAt: user.auditEntries[0]?.occurredAt ?? user.createdAt,
      restrictedAt: user.restrictedAt,
      restrictionReason: user.restrictionReason,
      marketing: user.marketingPreference,
      listings: events.map((event) => ({
        id: event.id,
        title: event.title ?? "Untitled listing",
        updatedAt: event.updatedAt,
        lifecycle: eventLifecycle(event),
        published: event.publication !== null,
      })),
      payments: user.paymentAttempts,
      successfulPurchases: successful.length,
      spent: totals(successful),
      activity: user.auditEntries.map((entry) => ({
        id: entry.id.toString(),
        action: entry.action,
        occurredAt: entry.occurredAt,
        targetType: entry.targetType,
        targetId: entry.targetId,
      })),
      capabilities: {
        resendVerification:
          user.role === "USER" &&
          user.status === "ACTIVE" &&
          !user.emailVerifiedAt,
        restrict: user.role === "USER" && user.status === "ACTIVE",
        restore: user.role === "USER" && user.status === "RESTRICTED",
        revokeSessions: user.role === "USER",
      },
    };
  }
}

export class AdminUserManagement {
  constructor(private readonly repository: PrismaAdminUserRepository) {}

  async restrict(
    session: CurrentSession | null,
    input: {
      targetId: string;
      expectedUpdatedAt: Date;
      reason: string;
      requestId?: string;
    },
  ) {
    const admin = authorizeRecentAdminService(session).principal;
    return this.repository.restrict({ ...input, actorId: admin.id });
  }

  async restore(
    session: CurrentSession | null,
    input: {
      targetId: string;
      expectedUpdatedAt: Date;
      requestId?: string;
    },
  ) {
    const admin = authorizeRecentAdminService(session).principal;
    return this.repository.restore({ ...input, actorId: admin.id });
  }

  async revokeSessions(
    session: CurrentSession | null,
    input: { targetId: string; requestId?: string },
  ) {
    const admin = authorizeRecentAdminService(session).principal;
    return this.repository.revokeSessions({ ...input, actorId: admin.id });
  }

  async resendTarget(principal: AuthPrincipal | null, targetId: string) {
    authorizeAdminService(principal);
    const target = await this.repository.findResendTarget(targetId);
    if (!target) throw new AdminNotFoundError();
    if (
      target.role !== "USER" ||
      target.status !== "ACTIVE" ||
      target.emailVerifiedAt
    ) {
      throw new AdminConflictError(
        "INVALID_ACCOUNT_STATE",
        "Verification email cannot be resent for this account.",
      );
    }
    return target;
  }
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? "";
}

function spentText(
  values: Array<{ currency: string; amount: number }>,
): string {
  return values
    .map(
      (value) =>
        `${value.currency.toUpperCase()} ${(value.amount / 100).toFixed(2)}`,
    )
    .join("; ");
}

export class AdminMarketingExport {
  constructor(private readonly repository: PrismaAdminUserRepository) {}

  async preview(principal: AuthPrincipal | null, search: string) {
    authorizeAdminService(principal);
    const rows = await this.repository.contactExport(search, 10_001);
    return { count: rows.length, exceedsLimit: rows.length > 10_000 };
  }

  async export(
    session: CurrentSession | null,
    search: string,
    requestId: string,
  ) {
    const admin = authorizeRecentAdminService(session).principal;
    const rows = await this.repository.contactExport(search, 10_001);
    if (rows.length > 10_000) throw new AdminExportLimitError();
    const data = rows.map((user) => {
      const publications =
        user.organizerProfile?.events.filter((event) => event.publication)
          .length ?? 0;
      return [
        user.displayName,
        user.email,
        iso(user.createdAt),
        user.emailVerifiedAt ? "Yes" : "No",
        user.status,
        iso(user.auditEntries[0]?.occurredAt),
        String(publications),
        String(user.paymentAttempts.length),
        spentText(totals(user.paymentAttempts)),
      ];
    });
    await this.repository.auditExport({
      actorId: admin.id,
      requestId,
      searched: Boolean(search),
      rowCount: data.length,
    });
    return {
      count: data.length,
      bytes: encodeMarketingCsv([
        [
          "Name",
          "Email",
          "Signup date",
          "Email verified",
          "Account status",
          "Last activity",
          "Published listings",
          "Successful purchases",
          "Total spent",
        ],
        ...data,
      ]),
    };
  }
}
