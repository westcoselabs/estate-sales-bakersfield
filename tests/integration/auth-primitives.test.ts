import { afterAll, describe, expect, it } from "vitest";

import { SessionService } from "@/modules/auth/application/session-service";
import { SingleUseTokenService } from "@/modules/auth/application/single-use-token-service";
import { CryptoOpaqueTokenProvider } from "@/modules/auth/infrastructure/crypto-token-provider";
import { PrismaSessionRepository } from "@/modules/auth/infrastructure/prisma-session-repository";
import { PrismaSingleUseTokenRepository } from "@/modules/auth/infrastructure/prisma-single-use-token-repository";

import { createIntegrationClient } from "./support/database";

const prisma = createIntegrationClient();
const tokenProvider = new CryptoOpaqueTokenProvider();
const sessionService = new SessionService(
  new PrismaSessionRepository(prisma),
  tokenProvider,
);
const singleUseTokens = new SingleUseTokenService(
  new PrismaSingleUseTokenRepository(prisma),
  tokenProvider,
);

async function createUser() {
  const normalizedEmail = `phase1-${crypto.randomUUID()}@example.test`;
  return prisma.user.create({
    data: {
      displayName: "Phase 1 fixture",
      email: normalizedEmail,
      normalizedEmail,
      passwordHash: "$argon2id$fixture",
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("opaque database session primitives", () => {
  it("creates, reads, rotates, logs out, and stores only hashes", async () => {
    const user = await createUser();
    const first = await sessionService.create(user.id, {
      deviceLabel: "Integration browser",
    });
    const persisted = await prisma.session.findUniqueOrThrow({
      where: { id: first.session.id },
    });

    expect(persisted.tokenHash).toBe(tokenProvider.hash(first.token));
    expect(JSON.stringify(persisted)).not.toContain(first.token);
    await expect(sessionService.read(first.token)).resolves.toMatchObject({
      userId: user.id,
    });

    const rotated = await sessionService.rotate(first.token, {
      deviceLabel: "Rotated browser",
    });
    expect(rotated).not.toBeNull();
    await expect(sessionService.read(first.token)).resolves.toBeNull();
    await expect(sessionService.read(rotated?.token)).resolves.toMatchObject({
      userId: user.id,
    });
    await expect(sessionService.logout(rotated?.token)).resolves.toBe(true);
    await expect(sessionService.read(rotated?.token)).resolves.toBeNull();

    const actions = await prisma.auditEntry.findMany({
      where: { actorUserId: user.id },
      orderBy: { occurredAt: "asc" },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action)).toEqual([
      "SESSION_CREATED",
      "SESSION_ROTATED",
      "SESSION_LOGOUT",
    ]);
  });

  it("revokes one owned session without touching another user's session", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownerFirst = await sessionService.create(owner.id);
    const ownerSecond = await sessionService.create(owner.id);
    const otherSession = await sessionService.create(other.id);

    await expect(
      sessionService.revokeSession(owner.id, otherSession.session.id),
    ).resolves.toBe(false);
    await expect(
      sessionService.revokeSession(owner.id, ownerFirst.session.id),
    ).resolves.toBe(true);
    await expect(sessionService.read(ownerFirst.token)).resolves.toBeNull();
    await expect(
      sessionService.read(ownerSecond.token),
    ).resolves.not.toBeNull();
    await expect(
      sessionService.read(otherSession.token),
    ).resolves.not.toBeNull();

    await expect(sessionService.revokeAll(owner.id)).resolves.toBe(1);
    await expect(sessionService.read(ownerSecond.token)).resolves.toBeNull();
    await expect(
      sessionService.read(otherSession.token),
    ).resolves.not.toBeNull();
  });

  it("rejects expired sessions", async () => {
    const user = await createUser();
    const token = tokenProvider.generate();
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: tokenProvider.hash(token),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(sessionService.read(token)).resolves.toBeNull();
  });

  it("consumes verification and reset tokens once and rejects expiry", async () => {
    const user = await createUser();
    const verification = await singleUseTokens.issue(
      "EMAIL_VERIFICATION",
      user.id,
    );
    await expect(
      singleUseTokens.consume("EMAIL_VERIFICATION", verification),
    ).resolves.toBe(user.id);
    await expect(
      singleUseTokens.consume("EMAIL_VERIFICATION", verification),
    ).resolves.toBeNull();

    const expired = tokenProvider.generate();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenProvider.hash(expired),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(
      singleUseTokens.consume("PASSWORD_RESET", expired),
    ).resolves.toBeNull();
  });

  it("rolls back session creation if the immutable audit write fails", async () => {
    const user = await createUser();
    await expect(
      sessionService.create(user.id, {}, { actorUserId: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("makes audit entries append-only", async () => {
    const user = await createUser();
    await sessionService.create(user.id);
    const entry = await prisma.auditEntry.findFirstOrThrow({
      where: { actorUserId: user.id },
    });

    await expect(
      prisma.auditEntry.update({
        where: { id: entry.id },
        data: { action: "MUTATED" },
      }),
    ).rejects.toThrow(/append-only/i);
    await expect(
      prisma.auditEntry.findUnique({ where: { id: entry.id } }),
    ).resolves.toMatchObject({
      action: "SESSION_CREATED",
    });
  });
});
