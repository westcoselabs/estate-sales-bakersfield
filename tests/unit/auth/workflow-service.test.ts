import { describe, expect, it, vi } from "vitest";

import type {
  AccountRepository,
  EmailService,
  OpaqueTokenProvider,
  PasswordHasher,
  PrivacyFingerprint,
  SessionRepository,
} from "@/modules/auth/application/ports";
import { SessionService } from "@/modules/auth/application/session-service";
import {
  AuthenticationWorkflowService,
  DUMMY_PASSWORD_HASH,
} from "@/modules/auth/application/workflow-service";
import {
  AccountConflictError,
  InvalidCredentialsError,
  MalformedPasswordHashError,
} from "@/modules/auth/domain/errors";
import type {
  AuthenticationAccount,
  CurrentSession,
} from "@/modules/auth/domain/types";

const now = new Date("2026-07-17T12:00:00.000Z");
const account: AuthenticationAccount = {
  id: "user-1",
  displayName: "Test person",
  email: "person@example.test",
  normalizedEmail: "person@example.test",
  passwordHash: "$argon2id$stored",
  emailVerifiedAt: null,
  role: "USER",
  status: "ACTIVE",
};

function dependencies() {
  const current: CurrentSession = {
    id: "session-1",
    userId: account.id,
    createdAt: now,
    expiresAt: new Date("2026-07-24T12:00:00.000Z"),
    passwordAuthenticatedAt: now,
    metadata: {},
    principal: account,
  };
  const accounts = {
    createWithVerification: vi.fn<AccountRepository["createWithVerification"]>(
      async () => ({
        status: "CREATED" as const,
        account,
        delivery: { id: "delivery-1", userId: account.id },
      }),
    ),
    findByNormalizedEmail: vi.fn<AccountRepository["findByNormalizedEmail"]>(
      async () => account,
    ),
    updatePasswordHash: vi.fn(async () => undefined),
    recordLogin: vi.fn(async () => undefined),
    issueVerification: vi.fn<AccountRepository["issueVerification"]>(
      async () => ({
        account,
        delivery: { id: "delivery-2", userId: account.id },
      }),
    ),
    verifyEmail: vi.fn<AccountRepository["verifyEmail"]>(async () => ({
      status: "VERIFIED" as const,
      account: { ...account, emailVerifiedAt: now },
      rotatedSession: { ...current, id: "session-2" },
    })),
    issuePasswordReset: vi.fn<AccountRepository["issuePasswordReset"]>(
      async () => ({
        account,
        delivery: { id: "delivery-3", userId: account.id },
      }),
    ),
    resetPassword: vi.fn(async () => ({
      userId: account.id,
      revokedSessionCount: 2,
    })),
    markDeliverySent: vi.fn(async () => undefined),
    markDeliveryFailed: vi.fn(async () => undefined),
  } satisfies AccountRepository;
  const passwords = {
    hash: vi.fn(async () => "$argon2id$new"),
    verify: vi.fn(async () => true),
    needsRehash: vi.fn(() => false),
  } satisfies PasswordHasher;
  const tokens = {
    generate: vi.fn(() => "raw-token-value-with-at-least-32-characters"),
    hash: vi.fn((token: string) => `sha256:${token}`),
  } satisfies OpaqueTokenProvider;
  const sessionRepository = {
    create: vi.fn(async () => current),
    findActiveByTokenHash: vi.fn(async () => current),
    rotate: vi.fn(async () => ({ ...current, id: "session-2" })),
    reauthenticate: vi.fn(async () => ({ ...current, id: "session-2" })),
    deleteCurrent: vi.fn(async () => true),
    deleteOwnedById: vi.fn(async () => true),
    deleteAllForUser: vi.fn(async () => 2),
    listForUser: vi.fn(async () => []),
  } satisfies SessionRepository;
  const email = {
    send: vi.fn(async () => ({ providerMessageId: "resend-1" })),
  } satisfies EmailService;
  const fingerprints = {
    create: vi.fn(() => "a".repeat(64)),
  } satisfies PrivacyFingerprint;
  const reportDeliveryTrackingFailure = vi.fn();
  const service = new AuthenticationWorkflowService(
    accounts,
    passwords,
    tokens,
    new SessionService(sessionRepository, tokens, () => now),
    email,
    fingerprints,
    new URL("https://preview.example.test"),
    () => now,
    reportDeliveryTrackingFailure,
  );
  return {
    accounts,
    email,
    passwords,
    reportDeliveryTrackingFailure,
    service,
    sessionRepository,
    tokens,
  };
}

describe("AuthenticationWorkflowService", () => {
  it("creates account and token state before sending a verification link", async () => {
    const { accounts, email, service } = dependencies();

    await service.register({
      displayName: "Test person",
      email: "person@example.test",
      password: "a-valid-registration-password",
    });

    expect(accounts.createWithVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationTokenHash: expect.stringMatching(/^sha256:/),
        verificationExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      }),
    );
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        actionUrl: expect.stringMatching(
          /^https:\/\/preview\.example\.test\/verify-email\?token=/,
        ),
        idempotencyKey: "delivery-1",
      }),
    );
    expect(accounts.markDeliverySent).toHaveBeenCalled();
  });

  it("maps a duplicate registration to a typed conflict without email", async () => {
    const { accounts, email, service } = dependencies();
    accounts.createWithVerification.mockResolvedValueOnce({
      status: "CONFLICT",
    });

    await expect(
      service.register({
        displayName: "Test person",
        email: "person@example.test",
        password: "a-valid-registration-password",
      }),
    ).rejects.toBeInstanceOf(AccountConflictError);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("uses the calibrated dummy hash for nonexistent-account login", async () => {
    const { accounts, passwords, service } = dependencies();
    accounts.findByNormalizedEmail.mockResolvedValueOnce(null);
    passwords.verify.mockResolvedValueOnce(false);

    await expect(
      service.login("unknown@example.test", "a-wrong-password"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(passwords.verify).toHaveBeenCalledWith(
      DUMMY_PASSWORD_HASH,
      "a-wrong-password",
    );
  });

  it("performs dummy Argon2 work and preserves operational evidence for a malformed stored hash", async () => {
    const { passwords, service } = dependencies();
    const malformed = new MalformedPasswordHashError("malformed stored hash");
    passwords.verify
      .mockRejectedValueOnce(malformed)
      .mockResolvedValueOnce(false);

    await expect(
      service.login(account.normalizedEmail, "a-wrong-password"),
    ).rejects.toBe(malformed);
    expect(passwords.verify).toHaveBeenNthCalledWith(
      1,
      account.passwordHash,
      "a-wrong-password",
    );
    expect(passwords.verify).toHaveBeenNthCalledWith(
      2,
      DUMMY_PASSWORD_HASH,
      "a-wrong-password",
    );
  });

  it("creates a session for an active unverified account", async () => {
    const { accounts, service, sessionRepository } = dependencies();
    const result = await service.login(
      account.normalizedEmail,
      "a-valid-login-password",
    );

    expect(result.account.emailVerified).toBe(false);
    expect(sessionRepository.create).toHaveBeenCalled();
    expect(accounts.recordLogin).toHaveBeenCalledWith(
      account.id,
      false,
      expect.objectContaining({ actorUserId: account.id }),
    );
  });

  it("rotates the matching current session after verification", async () => {
    const { accounts, service } = dependencies();
    const result = await service.verifyEmail(
      "raw-verification-token-with-32-characters",
      "raw-current-session-token-with-32-characters",
    );

    expect(result.account.emailVerified).toBe(true);
    expect(result.alreadyVerified).toBe(false);
    expect(result.authenticated).toBe(true);
    expect(result.rotatedSession?.session.id).toBe("session-2");
    expect(accounts.verifyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionRotation: expect.objectContaining({
          currentTokenHash:
            "sha256:raw-current-session-token-with-32-characters",
          replacementTokenHash:
            "sha256:raw-token-value-with-at-least-32-characters",
        }),
      }),
    );
  });

  it("returns a useful result when an already verified token is reused", async () => {
    const { accounts, service } = dependencies();
    accounts.verifyEmail.mockResolvedValueOnce({
      status: "ALREADY_VERIFIED",
      account: { ...account, emailVerifiedAt: now },
      rotatedSession: null,
    });

    const result = await service.verifyEmail(
      "raw-verification-token-with-32-characters",
      "raw-current-session-token-with-32-characters",
    );

    expect(result.account.emailVerified).toBe(true);
    expect(result.alreadyVerified).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.rotatedSession).toBeNull();
  });

  it("accepts registration after the email is sent when delivery tracking fails", async () => {
    const { accounts, email, reportDeliveryTrackingFailure, service } =
      dependencies();
    accounts.markDeliverySent.mockRejectedValueOnce(
      new Error("tracking unavailable"),
    );

    await expect(
      service.register({
        displayName: "Test person",
        email: "person@example.test",
        password: "a-valid-registration-password",
      }),
    ).resolves.toEqual({ accepted: true, emailDeliveryAttempted: true });
    expect(email.send).toHaveBeenCalledOnce();
    expect(accounts.markDeliveryFailed).not.toHaveBeenCalled();
    expect(reportDeliveryTrackingFailure).toHaveBeenCalledWith({
      deliveryId: "delivery-1",
      status: "SENT",
      errorType: "Error",
    });
  });

  it("records provider failures without exposing the raw token", async () => {
    const { accounts, email, service } = dependencies();
    email.send.mockRejectedValueOnce(new Error("provider failed"));

    await expect(
      service.requestPasswordReset(account.normalizedEmail),
    ).resolves.toBeUndefined();
    expect(accounts.issuePasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      }),
    );
    expect(accounts.markDeliveryFailed).toHaveBeenCalledWith(
      "delivery-3",
      "Error",
      now,
    );
    expect(
      JSON.stringify(accounts.markDeliveryFailed.mock.calls),
    ).not.toContain("raw-token");
  });

  it("keeps an accepted recovery response when failed-delivery tracking is unavailable", async () => {
    const { accounts, email, reportDeliveryTrackingFailure, service } =
      dependencies();
    email.send.mockRejectedValueOnce(new Error("provider failed"));
    accounts.markDeliveryFailed.mockRejectedValueOnce(
      new Error("tracking unavailable"),
    );

    await expect(
      service.requestPasswordReset(account.normalizedEmail),
    ).resolves.toBeUndefined();
    expect(reportDeliveryTrackingFailure).toHaveBeenCalledWith({
      deliveryId: "delivery-3",
      status: "FAILED",
      errorType: "Error",
    });
  });

  it("keeps recovery and resend responses silent for ineligible accounts", async () => {
    const { accounts, email, service } = dependencies();
    accounts.issueVerification.mockResolvedValueOnce(null);
    accounts.issuePasswordReset.mockResolvedValueOnce(null);

    await expect(
      service.resendVerification("unknown@example.test"),
    ).resolves.toBeUndefined();
    await expect(
      service.requestPasswordReset("unknown@example.test"),
    ).resolves.toBeUndefined();
    expect(email.send).not.toHaveBeenCalled();
  });
});
