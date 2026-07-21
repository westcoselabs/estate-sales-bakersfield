import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import type {
  AuditContext,
  CreateStoredSessionInput,
  RotateStoredSessionInput,
  SessionRepository,
} from "../application/ports";
import type { CurrentSession, SessionSummary } from "../domain/types";

const principalSelection = {
  id: true,
  displayName: true,
  normalizedEmail: true,
  emailVerifiedAt: true,
  role: true,
  status: true,
} as const;

type StoredSession = Awaited<
  ReturnType<PrismaClient["session"]["findFirstOrThrow"]>
> & {
  user: {
    id: string;
    displayName: string;
    normalizedEmail: string;
    emailVerifiedAt: Date | null;
    role: "USER" | "ADMIN";
    status: "ACTIVE" | "RESTRICTED" | "DISABLED";
  };
};

function mapSession(session: StoredSession): CurrentSession {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
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

function auditActor(audit: AuditContext, fallbackUserId: string): string {
  return audit.actorUserId ?? fallbackUserId;
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateStoredSessionInput): Promise<CurrentSession> {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ...(input.metadata.userAgent
            ? { userAgent: input.metadata.userAgent }
            : {}),
          ...(input.metadata.deviceLabel
            ? { deviceLabel: input.metadata.deviceLabel }
            : {}),
        },
        include: { user: { select: principalSelection } },
      });
      await transaction.auditEntry.create({
        data: {
          actorUserId: auditActor(input.audit, input.userId),
          action: "SESSION_CREATED",
          targetType: "SESSION",
          targetId: session.id,
          ...(input.audit.requestId
            ? { requestId: input.audit.requestId }
            : {}),
        },
      });
      return mapSession(session);
    });
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<CurrentSession | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: now },
        user: { status: { not: "DISABLED" } },
      },
      include: { user: { select: principalSelection } },
    });
    return session ? mapSession(session) : null;
  }

  async rotate(
    input: RotateStoredSessionInput,
  ): Promise<CurrentSession | null> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.session.findFirst({
        where: {
          tokenHash: input.currentTokenHash,
          expiresAt: { gt: input.now },
          user: { status: { not: "DISABLED" } },
        },
        include: { user: { select: principalSelection } },
      });
      if (!current) return null;

      const replacement = await transaction.session.create({
        data: {
          userId: current.userId,
          tokenHash: input.replacementTokenHash,
          expiresAt: input.replacementExpiresAt,
          ...(input.metadata.userAgent
            ? { userAgent: input.metadata.userAgent }
            : {}),
          ...(input.metadata.deviceLabel
            ? { deviceLabel: input.metadata.deviceLabel }
            : {}),
        },
        include: { user: { select: principalSelection } },
      });
      await transaction.session.delete({ where: { id: current.id } });
      await transaction.auditEntry.create({
        data: {
          actorUserId: auditActor(input.audit, current.userId),
          action: "SESSION_ROTATED",
          targetType: "SESSION",
          targetId: replacement.id,
          ...(input.audit.requestId
            ? { requestId: input.audit.requestId }
            : {}),
          metadata: { previousSessionId: current.id },
        },
      });
      return mapSession(replacement);
    });
  }

  async deleteCurrent(
    tokenHash: string,
    audit: AuditContext,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { tokenHash },
      });
      if (!session) return false;
      await transaction.session.delete({ where: { id: session.id } });
      await transaction.auditEntry.create({
        data: {
          actorUserId: auditActor(audit, session.userId),
          action: "SESSION_LOGOUT",
          targetType: "SESSION",
          targetId: session.id,
          ...(audit.requestId ? { requestId: audit.requestId } : {}),
        },
      });
      return true;
    });
  }

  async deleteOwnedById(
    userId: string,
    sessionId: string,
    audit: AuditContext,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const deletion = await transaction.session.deleteMany({
        where: { id: sessionId, userId },
      });
      if (deletion.count !== 1) return false;
      await transaction.auditEntry.create({
        data: {
          actorUserId: auditActor(audit, userId),
          action: "SESSION_REVOKED",
          targetType: "SESSION",
          targetId: sessionId,
          ...(audit.requestId ? { requestId: audit.requestId } : {}),
        },
      });
      return true;
    });
  }

  async deleteAllForUser(userId: string, audit: AuditContext): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const deletion = await transaction.session.deleteMany({
        where: { userId },
      });
      await transaction.auditEntry.create({
        data: {
          actorUserId: auditActor(audit, userId),
          action: "SESSIONS_REVOKED_ALL",
          targetType: "USER",
          targetId: userId,
          ...(audit.requestId ? { requestId: audit.requestId } : {}),
          metadata: { revokedCount: deletion.count },
        },
      });
      return deletion.count;
    });
  }

  async listForUser(userId: string): Promise<readonly SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        expiresAt: true,
        createdAt: true,
        userAgent: true,
        deviceLabel: true,
      },
    });
    return sessions.map((session) => ({
      id: session.id,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      metadata: {
        ...(session.userAgent ? { userAgent: session.userAgent } : {}),
        ...(session.deviceLabel ? { deviceLabel: session.deviceLabel } : {}),
      },
    }));
  }
}
