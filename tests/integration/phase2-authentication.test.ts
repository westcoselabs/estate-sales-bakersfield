import { afterAll, describe, expect, it } from "vitest";

import type {
  AuthenticationEmailMessage,
  EmailService,
} from "@/modules/auth/application/ports";
import { SessionService } from "@/modules/auth/application/session-service";
import { AuthenticationWorkflowService } from "@/modules/auth/application/workflow-service";
import {
  AccountConflictError,
  InvalidCredentialsError,
  InvalidTokenError,
} from "@/modules/auth/domain/errors";
import { Argon2PasswordHasher } from "@/modules/auth/infrastructure/argon2-password-hasher";
import { CryptoOpaqueTokenProvider } from "@/modules/auth/infrastructure/crypto-token-provider";
import { HmacPrivacyFingerprint } from "@/modules/auth/infrastructure/hmac-privacy-fingerprint";
import { PrismaAccountRepository } from "@/modules/auth/infrastructure/prisma-account-repository";
import { PrismaSessionRepository } from "@/modules/auth/infrastructure/prisma-session-repository";
import { OrganizerService } from "@/modules/organizers/application/organizer-service";
import { organizerProfileSchema } from "@/modules/organizers/application/schemas";
import { PrismaOrganizerProfileRepository } from "@/modules/organizers/infrastructure/prisma-organizer-profile-repository";

import { createIntegrationClient } from "./support/database";
import { testEmail } from "./support/test-run";

const prisma = createIntegrationClient();
const tokenProvider = new CryptoOpaqueTokenProvider();
const passwordHasher = new Argon2PasswordHasher();
const sessions = new SessionService(
  new PrismaSessionRepository(prisma),
  tokenProvider,
);

class CaptureEmailService implements EmailService {
  readonly messages: AuthenticationEmailMessage[] = [];

  send(message: AuthenticationEmailMessage) {
    this.messages.push(message);
    return Promise.resolve({
      providerMessageId: `integration-${crypto.randomUUID()}`,
    });
  }
}

function fixture() {
  const email = new CaptureEmailService();
  const accounts = new PrismaAccountRepository(prisma);
  const workflow = new AuthenticationWorkflowService(
    accounts,
    passwordHasher,
    tokenProvider,
    sessions,
    email,
    new HmacPrivacyFingerprint("phase-two-integration-fingerprint-secret"),
    new URL("https://integration.example.test"),
  );
  return { accounts, email, workflow };
}

function tokenFrom(message: AuthenticationEmailMessage): string {
  const token = new URL(message.actionUrl).searchParams.get("token");
  if (!token) throw new Error("Captured message did not contain a token");
  return token;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Phase 2 authentication persistence", () => {
  it("registers transactionally, stores token hashes, and resists a duplicate race", async () => {
    const { email, workflow } = fixture();
    const normalizedEmail = testEmail("registration");
    const input = {
      displayName: "Registration fixture",
      email: normalizedEmail,
      password: "phase-two-registration-password",
    };

    const results = await Promise.allSettled([
      workflow.register(input),
      workflow.register(input),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof AccountConflictError,
      ),
    ).toHaveLength(1);
    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail },
    });
    const token = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    const rawToken = tokenFrom(email.messages[0] as AuthenticationEmailMessage);
    expect(token.tokenHash).toBe(tokenProvider.hash(rawToken));
    expect(JSON.stringify(token)).not.toContain(rawToken);
    await expect(
      prisma.auditEntry.count({
        where: { targetId: user.id, action: "ACCOUNT_CREATED" },
      }),
    ).resolves.toBe(1);
  });

  it("keeps a failed registration email recoverable without partial account state", async () => {
    const accounts = new PrismaAccountRepository(prisma);
    const failingWorkflow = new AuthenticationWorkflowService(
      accounts,
      passwordHasher,
      tokenProvider,
      sessions,
      {
        send: () => Promise.reject(new Error("simulated provider failure")),
      },
      new HmacPrivacyFingerprint("phase-two-integration-fingerprint-secret"),
      new URL("https://integration.example.test"),
    );
    const normalizedEmail = testEmail("delivery-failure");

    await expect(
      failingWorkflow.register({
        displayName: "Delivery failure fixture",
        email: normalizedEmail,
        password: "phase-two-delivery-failure-password",
      }),
    ).resolves.toEqual({ accepted: true, emailDeliveryAttempted: false });

    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail },
    });
    await expect(
      prisma.emailVerificationToken.count({
        where: {
          userId: user.id,
          consumedAt: null,
          invalidatedAt: null,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.emailDelivery.findFirstOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      attempts: 1,
      lastErrorCode: "Error",
    });

    const recovery = fixture();
    await recovery.workflow.resendVerification(normalizedEmail);
    expect(recovery.email.messages).toHaveLength(1);
    await expect(
      prisma.emailVerificationToken.count({
        where: {
          userId: user.id,
          consumedAt: null,
          invalidatedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });

  it("verifies once, rotates a matching session, and audits a repeated rejection", async () => {
    const { email, workflow } = fixture();
    const normalizedEmail = testEmail("verification");
    const password = "phase-two-verification-password";
    await workflow.register({
      displayName: "Verification fixture",
      email: normalizedEmail,
      password,
    });
    const login = await workflow.login(normalizedEmail, password);
    const rawToken = tokenFrom(email.messages[0] as AuthenticationEmailMessage);

    const verification = await workflow.verifyEmail(
      rawToken,
      login.grant.token,
    );

    expect(verification.account.emailVerified).toBe(true);
    expect(verification.rotatedSession).not.toBeNull();
    await expect(sessions.read(login.grant.token)).resolves.toBeNull();
    await expect(
      sessions.read(verification.rotatedSession?.token),
    ).resolves.not.toBeNull();
    await expect(
      workflow.verifyEmail(rawToken, undefined),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail },
    });
    await expect(
      prisma.auditEntry.count({
        where: {
          targetId: user.id,
          action: "EMAIL_VERIFICATION_REJECTED",
        },
      }),
    ).resolves.toBe(1);
  });

  it("allows only one concurrent verification-token consumer", async () => {
    const { accounts, email, workflow } = fixture();
    const normalizedEmail = testEmail("verify-race");
    await workflow.register({
      displayName: "Verification race",
      email: normalizedEmail,
      password: "phase-two-verification-race-password",
    });
    const rawToken = tokenFrom(email.messages[0] as AuthenticationEmailMessage);
    const tokenHash = tokenProvider.hash(rawToken);
    const attempts = await Promise.all([
      accounts.verifyEmail({ tokenHash, now: new Date(), audit: {} }),
      accounts.verifyEmail({ tokenHash, now: new Date(), audit: {} }),
    ]);

    expect(attempts.filter(Boolean)).toHaveLength(1);
  });

  it("keeps verification and reset issuance races generic with one active token", async () => {
    const { accounts, workflow } = fixture();
    const normalizedEmail = testEmail("issue-race");
    await workflow.register({
      displayName: "Issue race",
      email: normalizedEmail,
      password: "phase-two-issuance-race-password",
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail },
    });
    const now = new Date();
    const verificationResults = await Promise.all([
      accounts.issueVerification({
        normalizedEmail,
        tokenHash: tokenProvider.hash(tokenProvider.generate()),
        expiresAt: new Date(now.getTime() + 60_000),
        recipientHash: "a".repeat(64),
        now,
        audit: {},
      }),
      accounts.issueVerification({
        normalizedEmail,
        tokenHash: tokenProvider.hash(tokenProvider.generate()),
        expiresAt: new Date(now.getTime() + 60_000),
        recipientHash: "b".repeat(64),
        now,
        audit: {},
      }),
    ]);
    expect(verificationResults.filter(Boolean)).toHaveLength(1);
    await expect(
      prisma.emailVerificationToken.count({
        where: {
          userId: user.id,
          consumedAt: null,
          invalidatedAt: null,
        },
      }),
    ).resolves.toBe(1);

    const resetResults = await Promise.all([
      accounts.issuePasswordReset({
        normalizedEmail,
        tokenHash: tokenProvider.hash(tokenProvider.generate()),
        expiresAt: new Date(now.getTime() + 60_000),
        recipientHash: "c".repeat(64),
        now,
        audit: {},
      }),
      accounts.issuePasswordReset({
        normalizedEmail,
        tokenHash: tokenProvider.hash(tokenProvider.generate()),
        expiresAt: new Date(now.getTime() + 60_000),
        recipientHash: "d".repeat(64),
        now,
        audit: {},
      }),
    ]);
    expect(resetResults.filter(Boolean)).toHaveLength(1);
    await expect(
      prisma.passwordResetToken.count({
        where: {
          userId: user.id,
          consumedAt: null,
          invalidatedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });

  it("rolls verification back when atomic session replacement fails", async () => {
    const { accounts, email, workflow } = fixture();
    const normalizedEmail = testEmail("verify-rollback");
    const password = "phase-two-verification-rollback-password";
    await workflow.register({
      displayName: "Verification rollback",
      email: normalizedEmail,
      password,
    });
    const login = await workflow.login(normalizedEmail, password);
    const rawToken = tokenFrom(email.messages[0] as AuthenticationEmailMessage);
    const currentHash = tokenProvider.hash(login.grant.token);

    await expect(
      accounts.verifyEmail({
        tokenHash: tokenProvider.hash(rawToken),
        now: new Date(),
        audit: {},
        sessionRotation: {
          currentTokenHash: currentHash,
          replacementTokenHash: currentHash,
          replacementExpiresAt: new Date(Date.now() + 60_000),
          metadata: {},
        },
      }),
    ).rejects.toThrow();

    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail },
    });
    expect(user.emailVerifiedAt).toBeNull();
    await expect(
      prisma.emailVerificationToken.findUniqueOrThrow({
        where: { tokenHash: tokenProvider.hash(rawToken) },
      }),
    ).resolves.toMatchObject({ consumedAt: null, invalidatedAt: null });
    await expect(sessions.read(login.grant.token)).resolves.not.toBeNull();
  });

  it("invalidates replaced verification tokens and does not issue for a verified account", async () => {
    const { email, workflow } = fixture();
    const normalizedEmail = testEmail("resend");
    await workflow.register({
      displayName: "Resend fixture",
      email: normalizedEmail,
      password: "phase-two-resend-password",
    });
    const firstToken = tokenFrom(
      email.messages[0] as AuthenticationEmailMessage,
    );
    await workflow.resendVerification(normalizedEmail);
    const secondToken = tokenFrom(
      email.messages[1] as AuthenticationEmailMessage,
    );

    await expect(
      prisma.emailVerificationToken.findUniqueOrThrow({
        where: { tokenHash: tokenProvider.hash(firstToken) },
      }),
    ).resolves.toMatchObject({ consumedAt: null });
    expect(
      (
        await prisma.emailVerificationToken.findUniqueOrThrow({
          where: { tokenHash: tokenProvider.hash(firstToken) },
        })
      ).invalidatedAt,
    ).not.toBeNull();
    await expect(
      prisma.emailVerificationToken.findUniqueOrThrow({
        where: { tokenHash: tokenProvider.hash(secondToken) },
      }),
    ).resolves.toMatchObject({ consumedAt: null, invalidatedAt: null });

    await expect(
      workflow.verifyEmail(firstToken, undefined),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(
      workflow.verifyEmail(secondToken, undefined),
    ).resolves.toMatchObject({
      account: { emailVerified: true },
    });
    const messageCount = email.messages.length;
    await workflow.resendVerification(normalizedEmail);
    expect(email.messages).toHaveLength(messageCount);
  });

  it("rejects an expired reset token and preserves its single-use state", async () => {
    const { email, workflow } = fixture();
    const normalizedEmail = testEmail("expired-reset");
    await workflow.register({
      displayName: "Expired reset fixture",
      email: normalizedEmail,
      password: "phase-two-expired-reset-password",
    });
    await workflow.requestPasswordReset(normalizedEmail);
    const resetMessage = email.messages.find(
      (message) => message.kind === "PASSWORD_RESET",
    );
    const rawToken = tokenFrom(resetMessage as AuthenticationEmailMessage);
    const tokenHash = tokenProvider.hash(rawToken);
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(0) },
    });

    await expect(
      workflow.resetPassword(rawToken, "phase-two-rejected-reset-password"),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(
      prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash } }),
    ).resolves.toMatchObject({
      consumedAt: null,
      invalidatedAt: null,
      attemptCount: 1,
    });
  });

  it("consumes one reset token and revokes every existing session transactionally", async () => {
    const { email, workflow } = fixture();
    const normalizedEmail = testEmail("reset");
    const password = "phase-two-before-reset-password";
    await workflow.register({
      displayName: "Reset fixture",
      email: normalizedEmail,
      password,
    });
    const first = await workflow.login(normalizedEmail, password);
    const second = await workflow.login(normalizedEmail, password);
    await workflow.requestPasswordReset(normalizedEmail);
    const resetMessage = email.messages.find(
      (message) => message.kind === "PASSWORD_RESET",
    );
    const rawToken = tokenFrom(resetMessage as AuthenticationEmailMessage);

    const results = await Promise.allSettled([
      workflow.resetPassword(rawToken, "phase-two-after-reset-password"),
      workflow.resetPassword(rawToken, "phase-two-second-reset-password"),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof InvalidTokenError,
      ),
    ).toHaveLength(1);
    await expect(sessions.read(first.grant.token)).resolves.toBeNull();
    await expect(sessions.read(second.grant.token)).resolves.toBeNull();
    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail },
    });
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("keeps restricted account login generic", async () => {
    const { workflow } = fixture();
    const normalizedEmail = testEmail("restricted");
    const password = "phase-two-restricted-password";
    await workflow.register({
      displayName: "Restricted fixture",
      email: normalizedEmail,
      password,
    });
    await prisma.user.update({
      where: { normalizedEmail },
      data: { status: "RESTRICTED", restrictedAt: new Date() },
    });

    await expect(
      workflow.login(normalizedEmail, password),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe("Phase 2 organizer ownership", () => {
  it("enforces one user-owned profile and cannot mutate another user's profile", async () => {
    const firstEmail = testEmail("first-owner");
    const secondEmail = testEmail("second-owner");
    const first = await prisma.user.create({
      data: {
        displayName: "First owner",
        email: firstEmail,
        normalizedEmail: firstEmail,
        passwordHash: "$argon2id$fixture",
      },
    });
    const second = await prisma.user.create({
      data: {
        displayName: "Second owner",
        email: secondEmail,
        normalizedEmail: secondEmail,
        passwordHash: "$argon2id$fixture",
      },
    });
    const service = new OrganizerService(
      new PrismaOrganizerProfileRepository(prisma),
    );

    const firstProfile = await service.saveForUser(first.id, {
      displayName: "First organizer",
      contactName: "First owner",
      contactEmail: "first@example.test",
      contactPhone: null,
      websiteUrl: null,
    });
    const secondProfile = await service.saveForUser(second.id, {
      displayName: "Second organizer",
      contactName: "Second owner",
      contactEmail: "second@example.test",
      contactPhone: null,
      websiteUrl: null,
    });
    const attackerControlled = organizerProfileSchema.parse({
      id: secondProfile.id,
      userId: second.id,
      displayName: "Attempted cross-user overwrite",
      contactName: "First owner",
      contactEmail: "first@example.test",
    });
    await service.saveForUser(first.id, attackerControlled);

    await expect(service.getForUser(first.id)).resolves.toMatchObject({
      id: firstProfile.id,
      displayName: "Attempted cross-user overwrite",
    });
    await expect(service.getForUser(second.id)).resolves.toMatchObject({
      id: secondProfile.id,
      displayName: "Second organizer",
    });
    await expect(
      prisma.organizerProfile.count({ where: { userId: first.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.organizerProfile.count({ where: { userId: second.id } }),
    ).resolves.toBe(1);
  });
});
