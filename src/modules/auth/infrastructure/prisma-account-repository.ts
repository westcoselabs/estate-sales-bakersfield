import "server-only";

import { MARKETING_CONSENT_VERSION } from "../application/marketing-preference-service";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type { AccountRepository, AuditContext } from "../application/ports";
import type { AuthenticationAccount, CurrentSession } from "../domain/types";

const accountSelection = {
  id: true,
  displayName: true,
  email: true,
  normalizedEmail: true,
  passwordHash: true,
  emailVerifiedAt: true,
  role: true,
  status: true,
} as const;

type StoredAccount = {
  id: string;
  displayName: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  role: "USER" | "SUPER_ADMIN";
  status: "ACTIVE" | "RESTRICTED" | "DISABLED";
};

type StoredVerificationSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  passwordAuthenticatedAt: Date;
  userAgent: string | null;
  deviceLabel: string | null;
  user: Pick<
    StoredAccount,
    | "id"
    | "displayName"
    | "normalizedEmail"
    | "emailVerifiedAt"
    | "role"
    | "status"
  >;
};

function mapAccount(account: StoredAccount): AuthenticationAccount {
  return account;
}

function mapVerificationSession(
  session: StoredVerificationSession,
): CurrentSession {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    passwordAuthenticatedAt: session.passwordAuthenticatedAt,
    metadata: {
      ...(session.userAgent ? { userAgent: session.userAgent } : {}),
      ...(session.deviceLabel ? { deviceLabel: session.deviceLabel } : {}),
    },
    principal: {
      id: session.user.id,
      displayName: session.user.displayName,
      email: session.user.normalizedEmail,
      emailVerifiedAt: session.user.emailVerifiedAt,
      role: session.user.role,
      status: session.user.status,
    },
  };
}

function auditData(
  audit: AuditContext,
  input: {
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly actorUserId?: string;
    readonly metadata?: Prisma.InputJsonValue;
  },
) {
  return {
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ...(audit.requestId ? { requestId: audit.requestId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isIssuanceRace(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createWithVerification(
    input: Parameters<AccountRepository["createWithVerification"]>[0],
  ): Promise<Awaited<ReturnType<AccountRepository["createWithVerification"]>>> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const account = await transaction.user.create({
          data: {
            displayName: input.displayName,
            email: input.email,
            normalizedEmail: input.normalizedEmail,
            passwordHash: input.passwordHash,
          },
          select: accountSelection,
        });
        await transaction.emailVerificationToken.create({
          data: {
            userId: account.id,
            tokenHash: input.verificationTokenHash,
            expiresAt: input.verificationExpiresAt,
          },
        });
        const delivery = await transaction.emailDelivery.create({
          data: {
            userId: account.id,
            kind: "EMAIL_VERIFICATION",
            recipientHash: input.recipientHash,
          },
          select: { id: true, userId: true },
        });
        if (input.marketingOptIn) {
          await transaction.marketingPreference.create({
            data: {
              userId: account.id,
              consentAt: input.consentAt,
              consentVersion: MARKETING_CONSENT_VERSION,
              consentSource: "SIGNUP",
            },
          });
          await transaction.auditEntry.create({
            data: auditData(input.audit, {
              action: "MARKETING_CONSENT_GIVEN",
              targetType: "USER",
              targetId: account.id,
              actorUserId: account.id,
              metadata: {
                consentVersion: MARKETING_CONSENT_VERSION,
                consentSource: "SIGNUP",
              },
            }),
          });
        }
        await transaction.auditEntry.create({
          data: auditData(input.audit, {
            action: "ACCOUNT_CREATED",
            targetType: "USER",
            targetId: account.id,
            actorUserId: account.id,
          }),
        });
        return {
          status: "CREATED" as const,
          account: mapAccount(account),
          delivery,
        };
      });
    } catch (error) {
      if (isUniqueConstraint(error)) return { status: "CONFLICT" };
      throw error;
    }
  }

  async findByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<AuthenticationAccount | null> {
    const account = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      select: accountSelection,
    });
    return account ? mapAccount(account) : null;
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async recordLogin(
    userId: string,
    superAdmin: boolean,
    audit: AuditContext,
  ): Promise<void> {
    await this.prisma.auditEntry.create({
      data: auditData(audit, {
        action: superAdmin ? "SUPER_ADMIN_LOGIN" : "LOGIN_SUCCEEDED",
        targetType: "USER",
        targetId: userId,
        actorUserId: userId,
      }),
    });
  }

  async issueVerification(
    input: Parameters<AccountRepository["issueVerification"]>[0],
  ): Promise<Awaited<ReturnType<AccountRepository["issueVerification"]>>> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const account = await transaction.user.findFirst({
            where: {
              normalizedEmail: input.normalizedEmail,
              emailVerifiedAt: null,
              status: { not: "DISABLED" },
            },
            select: accountSelection,
          });
          if (!account) return null;

          const previous = await transaction.emailVerificationToken.findFirst({
            where: {
              userId: account.id,
              consumedAt: null,
              invalidatedAt: null,
            },
            orderBy: { createdAt: "desc" },
            select: { resendCount: true },
          });
          await transaction.emailVerificationToken.updateMany({
            where: {
              userId: account.id,
              consumedAt: null,
              invalidatedAt: null,
            },
            data: { invalidatedAt: input.now },
          });
          await transaction.emailVerificationToken.create({
            data: {
              userId: account.id,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
              resendCount: (previous?.resendCount ?? 0) + 1,
            },
          });
          const delivery = await transaction.emailDelivery.create({
            data: {
              userId: account.id,
              kind: "EMAIL_VERIFICATION",
              recipientHash: input.recipientHash,
            },
            select: { id: true, userId: true },
          });
          await transaction.auditEntry.create({
            data: auditData(input.audit, {
              action: "EMAIL_VERIFICATION_REISSUED",
              targetType: "USER",
              targetId: account.id,
              metadata: { resendCount: (previous?.resendCount ?? 0) + 1 },
            }),
          });
          return { account: mapAccount(account), delivery };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isIssuanceRace(error)) return null;
      throw error;
    }
  }

  async verifyEmail(
    input: Parameters<AccountRepository["verifyEmail"]>[0],
  ): Promise<Awaited<ReturnType<AccountRepository["verifyEmail"]>>> {
    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.$queryRaw<
        Array<{ user_id: string }>
      >(Prisma.sql`
        UPDATE "email_verification_tokens"
        SET
          "consumed_at" = ${input.now},
          "attempt_count" = "attempt_count" + 1
        WHERE "token_hash" = ${input.tokenHash}
          AND "consumed_at" IS NULL
          AND "invalidated_at" IS NULL
          AND "expires_at" > ${input.now}
          AND EXISTS (
            SELECT 1 FROM "users"
            WHERE "users"."id" = "email_verification_tokens"."user_id"
              AND "users"."status" <> 'DISABLED'
          )
        RETURNING "user_id"
      `);
      const userId = consumed[0]?.user_id;
      if (!userId) {
        const rejected = await transaction.emailVerificationToken.findUnique({
          where: { tokenHash: input.tokenHash },
          select: {
            id: true,
            userId: true,
            consumedAt: true,
            invalidatedAt: true,
            expiresAt: true,
            user: { select: accountSelection },
          },
        });
        if (rejected) {
          await transaction.emailVerificationToken.update({
            where: { id: rejected.id },
            data: { attemptCount: { increment: 1 } },
          });
          const reason = rejected.consumedAt
            ? "CONSUMED"
            : rejected.invalidatedAt
              ? "REPLACED"
              : rejected.expiresAt <= input.now
                ? "EXPIRED"
                : "ACCOUNT_UNAVAILABLE";
          await transaction.auditEntry.create({
            data: auditData(input.audit, {
              action: "EMAIL_VERIFICATION_REJECTED",
              targetType: "USER",
              targetId: rejected.userId,
              metadata: { reason },
            }),
          });
          if (
            reason === "CONSUMED" &&
            rejected.user.emailVerifiedAt &&
            rejected.user.status !== "DISABLED"
          ) {
            return {
              status: "ALREADY_VERIFIED" as const,
              account: mapAccount(rejected.user),
              rotatedSession: null,
            };
          }
        }
        return null;
      }

      const account = await transaction.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: input.now },
        select: accountSelection,
      });
      await transaction.emailVerificationToken.updateMany({
        where: {
          userId,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: input.now },
      });
      let rotatedSession: CurrentSession | null = null;
      if (input.sessionRotation) {
        const current = await transaction.session.findFirst({
          where: {
            userId,
            tokenHash: input.sessionRotation.currentTokenHash,
            expiresAt: { gt: input.now },
          },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                normalizedEmail: true,
                emailVerifiedAt: true,
                role: true,
                status: true,
              },
            },
          },
        });
        if (current) {
          const replacement = await transaction.session.create({
            data: {
              userId,
              tokenHash: input.sessionRotation.replacementTokenHash,
              expiresAt: input.sessionRotation.replacementExpiresAt,
              passwordAuthenticatedAt: current.passwordAuthenticatedAt,
              ...(input.sessionRotation.metadata.userAgent
                ? { userAgent: input.sessionRotation.metadata.userAgent }
                : {}),
              ...(input.sessionRotation.metadata.deviceLabel
                ? { deviceLabel: input.sessionRotation.metadata.deviceLabel }
                : {}),
            },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                  normalizedEmail: true,
                  emailVerifiedAt: true,
                  role: true,
                  status: true,
                },
              },
            },
          });
          await transaction.session.delete({ where: { id: current.id } });
          await transaction.auditEntry.create({
            data: auditData(input.audit, {
              action: "SESSION_ROTATED",
              targetType: "SESSION",
              targetId: replacement.id,
              actorUserId: userId,
              metadata: { previousSessionId: current.id },
            }),
          });
          rotatedSession = mapVerificationSession(replacement);
        }
      }
      await transaction.auditEntry.create({
        data: auditData(input.audit, {
          action: "EMAIL_VERIFIED",
          targetType: "USER",
          targetId: userId,
          actorUserId: userId,
        }),
      });
      return {
        status: "VERIFIED" as const,
        account: mapAccount(account),
        rotatedSession,
      };
    });
  }

  async issuePasswordReset(
    input: Parameters<AccountRepository["issuePasswordReset"]>[0],
  ): Promise<Awaited<ReturnType<AccountRepository["issuePasswordReset"]>>> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const account = await transaction.user.findFirst({
            where: {
              normalizedEmail: input.normalizedEmail,
              status: { not: "DISABLED" },
            },
            select: accountSelection,
          });
          if (!account) return null;

          await transaction.passwordResetToken.updateMany({
            where: {
              userId: account.id,
              consumedAt: null,
              invalidatedAt: null,
            },
            data: { invalidatedAt: input.now },
          });
          await transaction.passwordResetToken.create({
            data: {
              userId: account.id,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
            },
          });
          const delivery = await transaction.emailDelivery.create({
            data: {
              userId: account.id,
              kind: "PASSWORD_RESET",
              recipientHash: input.recipientHash,
            },
            select: { id: true, userId: true },
          });
          await transaction.auditEntry.create({
            data: auditData(input.audit, {
              action: "PASSWORD_RESET_REQUESTED",
              targetType: "USER",
              targetId: account.id,
            }),
          });
          return { account: mapAccount(account), delivery };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isIssuanceRace(error)) return null;
      throw error;
    }
  }

  async resetPassword(
    input: Parameters<AccountRepository["resetPassword"]>[0],
  ): Promise<Awaited<ReturnType<AccountRepository["resetPassword"]>>> {
    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.$queryRaw<
        Array<{ user_id: string }>
      >(Prisma.sql`
        UPDATE "password_reset_tokens"
        SET
          "consumed_at" = ${input.now},
          "attempt_count" = "attempt_count" + 1
        WHERE "token_hash" = ${input.tokenHash}
          AND "consumed_at" IS NULL
          AND "invalidated_at" IS NULL
          AND "expires_at" > ${input.now}
          AND EXISTS (
            SELECT 1 FROM "users"
            WHERE "users"."id" = "password_reset_tokens"."user_id"
              AND "users"."status" <> 'DISABLED'
          )
        RETURNING "user_id"
      `);
      const userId = consumed[0]?.user_id;
      if (!userId) {
        const rejected = await transaction.passwordResetToken.findUnique({
          where: { tokenHash: input.tokenHash },
          select: { id: true },
        });
        if (rejected) {
          await transaction.passwordResetToken.update({
            where: { id: rejected.id },
            data: { attemptCount: { increment: 1 } },
          });
        }
        return null;
      }

      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash: input.passwordHash },
      });
      await transaction.passwordResetToken.updateMany({
        where: {
          userId,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: input.now },
      });
      const sessions = await transaction.session.deleteMany({
        where: { userId },
      });
      await transaction.auditEntry.createMany({
        data: [
          auditData(input.audit, {
            action: "PASSWORD_RESET",
            targetType: "USER",
            targetId: userId,
            actorUserId: userId,
          }),
          auditData(input.audit, {
            action: "SESSIONS_REVOKED_ALL",
            targetType: "USER",
            targetId: userId,
            actorUserId: userId,
            metadata: {
              revokedCount: sessions.count,
              reason: "PASSWORD_RESET",
            },
          }),
        ],
      });
      return { userId, revokedSessionCount: sessions.count };
    });
  }

  async markDeliverySent(
    deliveryId: string,
    providerMessageId: string,
    now: Date,
    templateRevisionId?: string,
  ): Promise<void> {
    await this.prisma.emailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "SENT",
        providerMessageId,
        ...(templateRevisionId ? { templateRevisionId } : {}),
        attempts: { increment: 1 },
        sentAt: now,
        failedAt: null,
        lastErrorCode: null,
      },
    });
  }

  async markDeliveryFailed(
    deliveryId: string,
    errorCode: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.emailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        failedAt: now,
        sentAt: null,
        lastErrorCode: errorCode.slice(0, 100),
      },
    });
  }
}
