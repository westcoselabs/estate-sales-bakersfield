import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AdminMfaRepository } from "../application/admin-mfa-ports";
import { MFA_ENROLLMENT_TTL_MS } from "../application/admin-mfa-service";
import { MfaRequiredError, MfaVerificationError } from "../domain/errors";
import type { CurrentSession } from "../domain/types";

type Transaction = Prisma.TransactionClient;

export class PrismaAdminMfaRepository implements AdminMfaRepository {
  constructor(private readonly prisma: PrismaClient) {}
  find(userId: string) {
    return this.prisma.adminMfaCredential.findUnique({ where: { userId } });
  }

  // Every MFA mutation locks the user before checking session and credential.
  // Concurrent code consumers, enrollment replacements and recovery-code
  // regeneration therefore cannot race one another.
  private async lockSession(
    transaction: Transaction,
    session: CurrentSession,
    now: Date,
  ) {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${session.userId}::uuid FOR UPDATE`,
    );
    const current = await transaction.session.findFirst({
      where: {
        id: session.id,
        userId: session.userId,
        expiresAt: { gt: now },
        user: {
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          emailVerifiedAt: { not: null },
        },
      },
    });
    if (!current) throw new MfaVerificationError("Session expired");
    return current;
  }

  private audit(
    transaction: Transaction,
    session: CurrentSession,
    requestId: string,
    action: string,
  ) {
    return transaction.auditEntry.create({
      data: {
        actorUserId: session.userId,
        action,
        targetType: "USER",
        targetId: session.userId,
        requestId,
      },
    });
  }

  private async assertRecentMfa(
    transaction: Transaction,
    input: { session: CurrentSession; now: Date },
    version: number,
  ) {
    const current = await this.lockSession(
      transaction,
      input.session,
      input.now,
    );
    if (
      current.mfaCredentialVersion !== version ||
      !current.mfaAuthenticatedAt ||
      current.mfaAuthenticatedAt.getTime() <
        input.now.getTime() - 15 * 60 * 1000
    )
      throw new MfaRequiredError("Recent two-step verification is required");
  }

  async startEnrollment(
    input: Parameters<AdminMfaRepository["startEnrollment"]>[0],
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockSession(transaction, input.session, input.now);
      const credential = await transaction.adminMfaCredential.findUnique({
        where: { userId: input.session.userId },
      });
      if (credential?.enabledAt)
        await this.assertRecentMfa(transaction, input, credential.version);
      const pending = {
        pendingEncryptedSecret: input.ciphertext,
        pendingExpiresAt: new Date(input.now.getTime() + MFA_ENROLLMENT_TTL_MS),
        pendingSessionId: input.session.id,
      };
      await transaction.adminMfaCredential.upsert({
        where: { userId: input.session.userId },
        create: { userId: input.session.userId, ...pending },
        update: pending,
      });
      await this.audit(
        transaction,
        input.session,
        input.requestId,
        "ADMIN_MFA_ENROLLMENT_STARTED",
      );
    });
  }

  async completeEnrollment(
    input: Parameters<AdminMfaRepository["completeEnrollment"]>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockSession(transaction, input.session, input.now);
      const current = await transaction.adminMfaCredential.findUnique({
        where: { userId: input.session.userId },
      });
      if (
        !current?.pendingEncryptedSecret ||
        current.pendingEncryptedSecret !==
          input.credential.pendingEncryptedSecret ||
        current.version !== input.credential.version ||
        current.pendingSessionId !== input.session.id ||
        !current.pendingExpiresAt ||
        current.pendingExpiresAt <= input.now
      )
        return false;
      if (current.enabledAt)
        await this.assertRecentMfa(transaction, input, current.version);
      const version = current.version + 1;
      await transaction.adminMfaCredential.update({
        where: { userId: current.userId },
        data: {
          encryptedSecret: current.pendingEncryptedSecret,
          enabledAt: input.now,
          version,
          lastUsedStep: input.step,
          pendingEncryptedSecret: null,
          pendingExpiresAt: null,
          pendingSessionId: null,
        },
      });
      await this.replaceCodes(
        transaction,
        current.userId,
        input.recoveryHashes,
      );
      await transaction.session.deleteMany({
        where: { userId: current.userId, id: { not: input.session.id } },
      });
      await transaction.session.update({
        where: { id: input.session.id },
        data: {
          tokenHash: input.replacementTokenHash,
          mfaAuthenticatedAt: input.now,
          mfaCredentialVersion: version,
          passwordAuthenticatedAt: new Date(
            current.pendingExpiresAt.getTime() - MFA_ENROLLMENT_TTL_MS,
          ),
        },
      });
      await this.audit(
        transaction,
        input.session,
        input.requestId,
        "ADMIN_MFA_ENABLED",
      );
      return true;
    });
  }

  async authenticate(input: Parameters<AdminMfaRepository["authenticate"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockSession(transaction, input.session, input.now);
      const current = await transaction.adminMfaCredential.findUnique({
        where: { userId: input.session.userId },
      });
      if (
        !current?.enabledAt ||
        current.version !== input.credential.version ||
        current.encryptedSecret !== input.credential.encryptedSecret
      )
        return false;
      if (input.recoveryHash) {
        const consumed = await transaction.adminMfaRecoveryCode.updateMany({
          where: {
            userId: current.userId,
            codeHash: input.recoveryHash,
            consumedAt: null,
          },
          data: { consumedAt: input.now },
        });
        if (consumed.count !== 1) return false;
      } else {
        if (input.step === null || input.step <= current.lastUsedStep)
          return false;
        await transaction.adminMfaCredential.update({
          where: { userId: current.userId },
          data: { lastUsedStep: input.step },
        });
      }
      await transaction.session.update({
        where: { id: input.session.id },
        data: {
          tokenHash: input.replacementTokenHash,
          mfaAuthenticatedAt: input.now,
          mfaCredentialVersion: current.version,
        },
      });
      await this.audit(
        transaction,
        input.session,
        input.requestId,
        input.recoveryHash ? "ADMIN_MFA_RECOVERY_USED" : "ADMIN_MFA_VERIFIED",
      );
      return true;
    });
  }

  async replaceRecoveryCodes(
    input: Parameters<AdminMfaRepository["replaceRecoveryCodes"]>[0],
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await this.assertRecentMfa(transaction, input, input.credential.version);
      const current = await transaction.adminMfaCredential.findUnique({
        where: { userId: input.session.userId },
      });
      if (!current?.enabledAt || current.version !== input.credential.version)
        throw new MfaVerificationError("Credential changed");
      await this.replaceCodes(
        transaction,
        current.userId,
        input.recoveryHashes,
      );
      await transaction.session.update({
        where: { id: input.session.id },
        data: {
          tokenHash: input.replacementTokenHash,
          passwordAuthenticatedAt: input.now,
        },
      });
      await this.audit(
        transaction,
        input.session,
        input.requestId,
        "ADMIN_MFA_RECOVERY_REGENERATED",
      );
    });
  }

  private async replaceCodes(
    transaction: Transaction,
    userId: string,
    hashes: readonly string[],
  ) {
    await transaction.adminMfaRecoveryCode.deleteMany({ where: { userId } });
    await transaction.adminMfaRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    });
  }
}
