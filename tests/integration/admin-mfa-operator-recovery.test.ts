import { spawnSync } from "node:child_process";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { requireSuperAdminPrincipal } from "@/modules/auth/application/guards";
import { SessionService } from "@/modules/auth/application/session-service";
import { CryptoOpaqueTokenProvider } from "@/modules/auth/infrastructure/crypto-token-provider";
import { PrismaSessionRepository } from "@/modules/auth/infrastructure/prisma-session-repository";
import {
  redactTestDatabaseText,
  requireIsolatedTestDatabase,
} from "../../scripts/test-database-safety";
import { administratorMfaProof } from "./support/admin-mfa-fixtures";
import { createIntegrationClient } from "./support/database";
import { testEmail } from "./support/test-run";

const database = requireIsolatedTestDatabase();
const prisma = createIntegrationClient();
const tokens = new CryptoOpaqueTokenProvider();
const sessions = new SessionService(
  new PrismaSessionRepository(prisma),
  tokens,
);
let administratorId: string;
let ordinaryId: string;
let previousAdministratorId: string | null = null;

beforeAll(async () => {
  await prisma.$transaction(async (tx) => {
    const previous = await tx.user.findFirst({
      where: { role: "SUPER_ADMIN" },
    });
    previousAdministratorId = previous?.id ?? null;
    if (previous)
      await tx.user.update({
        where: { id: previous.id },
        data: { role: "USER" },
      });
    for (const role of ["SUPER_ADMIN", "USER"] as const) {
      const email = testEmail(`operator-recovery-${role.toLowerCase()}`);
      const user = await tx.user.create({
        data: {
          displayName: "Operator recovery fixture",
          email,
          normalizedEmail: email,
          passwordHash: "unchanged-test-password-hash",
          emailVerifiedAt: new Date(),
          role,
        },
      });
      if (role === "SUPER_ADMIN") administratorId = user.id;
      else ordinaryId = user.id;
    }
  });
});
beforeEach(async () => {
  await prisma.session.deleteMany({ where: { userId: administratorId } });
  await prisma.adminMfaCredential.deleteMany({
    where: { userId: administratorId },
  });
  const proof = await administratorMfaProof(prisma, administratorId);
  // Recovery must work even if the encryption key was lost. The operator path
  // removes credentials without requiring ciphertext to be decryptable.
  await prisma.adminMfaRecoveryCode.createMany({
    data: ["a", "b"].map((character) => ({
      userId: administratorId,
      codeHash: character.repeat(64),
    })),
  });
  for (let index = 0; index < 2; index += 1) {
    const grant = await sessions.create(administratorId);
    await prisma.session.update({
      where: { id: grant.session.id },
      data: proof,
    });
  }
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

function recover(
  userId: string,
  overrides: { environment?: string; confirm?: string } = {},
) {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/recover-admin-mfa.ts",
      `--user=${userId}`,
      `--environment=${overrides.environment ?? "test"}`,
      "--resource=development",
      `--confirm=${overrides.confirm ?? `RESET-ADMIN-MFA:${userId}`}`,
    ],
    {
      env: { ...process.env, LOG_LEVEL: "silent" },
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
    },
  );
  return {
    status: result.status,
    output: redactTestDatabaseText(
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      database,
    ),
  };
}

async function protectedState() {
  return {
    sessions: await prisma.session.count({
      where: { userId: administratorId },
    }),
    credentials: await prisma.adminMfaCredential.count({
      where: { userId: administratorId },
    }),
    codes: await prisma.adminMfaRecoveryCode.count({
      where: { userId: administratorId },
    }),
    audits: await prisma.auditEntry.count({
      where: { targetId: administratorId, action: "ADMIN_MFA_OPERATOR_RESET" },
    }),
  };
}

describe("operator MFA recovery command in an isolated database", () => {
  it("rejects mismatched confirmation or environment without mutation", async () => {
    const before = await protectedState();
    for (const overrides of [
      { confirm: "incorrect-confirmation" },
      { environment: "production" },
    ]) {
      const result = recover(administratorId, overrides);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain("Recovery requires");
    }
    expect(await protectedState()).toEqual(before);
  });

  it("refuses an ordinary account even with exact command confirmations", async () => {
    const other = await sessions.create(ordinaryId);
    const before = await protectedState();
    const result = recover(ordinaryId);
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("active, verified administrator");
    expect(await sessions.read(other.token)).not.toBeNull();
    expect(await protectedState()).toEqual(before);
  });

  it("revokes only the target's sessions and MFA, audits the reset and permits optional reenrollment", async () => {
    const other = await sessions.create(ordinaryId);
    const before = await protectedState();
    const result = recover(administratorId);
    expect(result.status, result.output).toBe(0);
    expect(await protectedState()).toEqual({
      sessions: 0,
      credentials: 0,
      codes: 0,
      audits: before.audits + 1,
    });
    expect(await sessions.read(other.token)).not.toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: administratorId } }),
    ).toMatchObject({
      role: "SUPER_ADMIN",
      passwordHash: "unchanged-test-password-hash",
    });
    const fresh = await sessions.create(administratorId);
    expect(() =>
      requireSuperAdminPrincipal(fresh.session.principal),
    ).not.toThrow();
  });
});
