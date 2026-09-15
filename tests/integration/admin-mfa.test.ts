import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TOTP } from "otpauth";

import {
  AdminMfaService,
  MFA_ENROLLMENT_TTL_MS,
} from "@/modules/auth/application/admin-mfa-service";
import {
  requireRecentSuperAdminSession,
  requireSuperAdminPrincipal,
} from "@/modules/auth/application/guards";
import { SessionService } from "@/modules/auth/application/session-service";
import { EncryptedTotpCryptography } from "@/modules/auth/infrastructure/admin-mfa-cryptography";
import { PrismaAdminMfaRepository } from "@/modules/auth/infrastructure/prisma-admin-mfa-repository";
import { PrismaAccountRepository } from "@/modules/auth/infrastructure/prisma-account-repository";
import { PrismaSessionRepository } from "@/modules/auth/infrastructure/prisma-session-repository";
import { CryptoOpaqueTokenProvider } from "@/modules/auth/infrastructure/crypto-token-provider";
import {
  MfaRequiredError,
  MfaVerificationError,
} from "@/modules/auth/domain/errors";
import type { SessionGrant } from "@/modules/auth/domain/types";
import { createIntegrationClient } from "./support/database";
import { testEmail } from "./support/test-run";

const prisma = createIntegrationClient();
const tokens = new CryptoOpaqueTokenProvider();
const cryptography = new EncryptedTotpCryptography("11".repeat(32));
let now = new Date("2030-01-01T12:00:00Z");
const sessions = new SessionService(
  new PrismaSessionRepository(prisma),
  tokens,
  () => now,
);
const repository = new PrismaAdminMfaRepository(prisma);
const service = new AdminMfaService(
  repository,
  cryptography,
  new PrismaAccountRepository(prisma),
  {
    hash: async () => "test-hash",
    verify: async (_, password) => password === "correct-password",
    needsRehash: () => false,
  },
  tokens,
  sessions,
  () => now,
);
let administratorId: string;
let previousAdministratorId: string | null = null;
let grant: SessionGrant;

beforeAll(async () => {
  const email = testEmail("mfa");
  await prisma.$transaction(async (transaction) => {
    const previous = await transaction.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
    previousAdministratorId = previous?.id ?? null;
    if (previous)
      await transaction.user.update({
        where: { id: previous.id },
        data: { role: "USER" },
      });
    const user = await transaction.user.create({
      data: {
        displayName: "MFA test administrator",
        email,
        normalizedEmail: email,
        passwordHash: "test-hash",
        role: "SUPER_ADMIN",
        emailVerifiedAt: now,
      },
    });
    administratorId = user.id;
  });
});
beforeEach(async () => {
  now = new Date("2030-01-01T12:00:00Z");
  await prisma.session.deleteMany({ where: { userId: administratorId } });
  await prisma.adminMfaCredential.deleteMany({
    where: { userId: administratorId },
  });
  grant = await sessions.create(administratorId, {}, {}, 8 * 60 * 60 * 1000);
});
afterAll(async () => {
  if (administratorId)
    await prisma.user.update({
      where: { id: administratorId },
      data: { role: "USER" },
    });
  if (previousAdministratorId)
    await prisma.user.update({
      where: { id: previousAdministratorId },
      data: { role: "SUPER_ADMIN" },
    });
  await prisma.$disconnect();
});

function code(secret: string) {
  return new TOTP({ secret }).generate({ timestamp: now.getTime() });
}
async function enroll() {
  const pending = await service.enroll(
    grant.session,
    "correct-password",
    "mfa-enroll-test",
  );
  const confirmed = await service.confirmEnrollment(
    grant.session,
    code(pending.secret),
    "mfa-confirm-test",
  );
  return { ...confirmed, secret: pending.secret };
}

describe("administrator MFA persistence", () => {
  it("allows password-only access until enrollment, then encrypts credentials and rotates sessions", async () => {
    expect(() =>
      requireSuperAdminPrincipal(grant.session.principal),
    ).not.toThrow();
    const sibling = await sessions.create(administratorId);
    const pending = await service.enroll(
      grant.session,
      "correct-password",
      "enroll",
    );
    const storedPending = await repository.find(administratorId);
    expect(JSON.stringify(storedPending)).not.toContain(pending.secret);
    expect(storedPending?.enabledAt).toBeNull();
    const confirmed = await service.confirmEnrollment(
      grant.session,
      code(pending.secret),
      "confirm",
    );
    expect(confirmed.recoveryCodes).toHaveLength(10);
    const persisted = await prisma.adminMfaRecoveryCode.findMany({
      where: { userId: administratorId },
    });
    for (const recoveryCode of confirmed.recoveryCodes)
      expect(JSON.stringify(persisted)).not.toContain(recoveryCode);
    expect(persisted[0]?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      requireRecentSuperAdminSession(confirmed.grant.session, now),
    ).not.toThrow();
    await expect(sessions.read(grant.token)).resolves.toBeNull();
    await expect(sessions.read(sibling.token)).resolves.toBeNull();
    expect(confirmed.grant.session.expiresAt).toEqual(grant.session.expiresAt);
    const passwordOnly = await sessions.create(administratorId);
    expect(() =>
      requireSuperAdminPrincipal(passwordOnly.session.principal),
    ).toThrow(MfaRequiredError);
  });

  it("requires password proof, binds enrollment to the current session and expires it", async () => {
    await expect(
      service.enroll(grant.session, "wrong-password", "wrong-password"),
    ).rejects.toThrow();
    const pending = await service.enroll(
      grant.session,
      "correct-password",
      "enroll",
    );
    const other = await sessions.create(administratorId);
    await expect(
      service.confirmEnrollment(
        other.session,
        code(pending.secret),
        "wrong-session",
      ),
    ).rejects.toThrow(MfaVerificationError);
    now = new Date(now.getTime() + MFA_ENROLLMENT_TTL_MS + 1);
    await expect(
      service.confirmEnrollment(grant.session, code(pending.secret), "expired"),
    ).rejects.toThrow(MfaVerificationError);
    expect((await repository.find(administratorId))?.enabledAt).toBeNull();
  });

  it("allows only one concurrent consumer of a TOTP time step and recovery code", async () => {
    const enrolled = await enroll();
    await expect(
      service.challenge(
        enrolled.grant.session,
        code(enrolled.secret),
        false,
        "replay-enrollment",
      ),
    ).rejects.toThrow(MfaVerificationError);
    now = new Date(now.getTime() + 30_000);
    const candidates = await Promise.all([
      sessions.create(administratorId),
      sessions.create(administratorId),
    ]);
    const outcomes = await Promise.allSettled(
      candidates.map((candidate) =>
        service.challenge(
          candidate.session,
          code(enrolled.secret),
          false,
          "race-totp",
        ),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const recoverySessions = await Promise.all([
      sessions.create(administratorId),
      sessions.create(administratorId),
    ]);
    const recoveryOutcomes = await Promise.allSettled(
      recoverySessions.map((candidate) =>
        service.challenge(
          candidate.session,
          enrolled.recoveryCodes[0]!,
          true,
          "race-recovery",
        ),
      ),
    );
    expect(
      recoveryOutcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      recoveryOutcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });

  it("denies old generations and stale MFA, replaces recovery codes, and requires fresh MFA for credential replacement", async () => {
    const enrolled = await enroll();
    const rotated = await service.regenerateRecoveryCodes(
      enrolled.grant.session,
      "correct-password",
      "regenerate",
    );
    const challengeSession = await sessions.create(administratorId);
    await expect(
      service.challenge(
        challengeSession.session,
        enrolled.recoveryCodes[0]!,
        true,
        "old-recovery",
      ),
    ).rejects.toThrow(MfaVerificationError);
    const proven = await service.challenge(
      challengeSession.session,
      rotated.recoveryCodes[0]!,
      true,
      "recovery",
    );
    await prisma.adminMfaCredential.update({
      where: { userId: administratorId },
      data: { version: { increment: 1 } },
    });
    const oldGeneration = await sessions.read(proven.token);
    expect(oldGeneration?.principal.mfaAuthenticatedAt).toBeNull();
    expect(() =>
      requireSuperAdminPrincipal(oldGeneration?.principal ?? null),
    ).toThrow(MfaRequiredError);
    now = new Date(now.getTime() + 16 * 60 * 1000);
    await expect(
      service.enroll(rotated.grant.session, "correct-password", "stale-mfa"),
    ).rejects.toThrow(MfaRequiredError);
  });

  it("rejects a revoked session between enrollment verification and commit without enabling its credential", async () => {
    const pending = await service.enroll(
      grant.session,
      "correct-password",
      "enroll",
    );
    await sessions.logout(grant.token);
    await expect(
      service.confirmEnrollment(grant.session, code(pending.secret), "revoked"),
    ).rejects.toThrow(MfaVerificationError);
    expect((await repository.find(administratorId))?.enabledAt).toBeNull();
  });
});
