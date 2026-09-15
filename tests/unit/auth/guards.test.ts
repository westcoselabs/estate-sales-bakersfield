import { describe, expect, it } from "vitest";

import {
  requireSuperAdminPrincipal,
  requireRecentSuperAdminSession,
  requireUserPrincipal,
  requireVerifiedPublishingPrincipal,
} from "@/modules/auth/application/guards";
import {
  AuthenticationError,
  AuthorizationError,
  EmailVerificationRequiredError,
  MfaRequiredError,
} from "@/modules/auth/domain/errors";
import type { AuthPrincipal } from "@/modules/auth/domain/types";

const user: AuthPrincipal = {
  id: "user-1",
  displayName: "Test user",
  email: "person@example.test",
  emailVerifiedAt: null,
  role: "USER",
  status: "ACTIVE",
};

describe("authorization guards", () => {
  it("returns a narrow authenticated principal", () => {
    expect(requireUserPrincipal(user)).toBe(user);
  });

  it("requires password authentication within the preceding 15 minutes", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const principal = {
      ...user,
      role: "SUPER_ADMIN" as const,
      emailVerifiedAt: now,
      mfaEnabled: true,
      mfaAuthenticatedAt: now,
    };
    const session = {
      id: "session-1",
      userId: principal.id,
      createdAt: new Date("2026-07-30T04:00:00.000Z"),
      expiresAt: new Date("2026-07-30T20:00:00.000Z"),
      passwordAuthenticatedAt: new Date("2026-07-30T11:46:00.000Z"),
      mfaAuthenticatedAt: now,
      metadata: {},
      principal,
    };
    expect(requireRecentSuperAdminSession(session, now)).toBe(session);
    expect(() =>
      requireRecentSuperAdminSession(
        {
          ...session,
          passwordAuthenticatedAt: new Date("2026-07-30T11:44:59.999Z"),
        },
        now,
      ),
    ).toThrow(AuthorizationError);
    expect(() =>
      requireRecentSuperAdminSession(
        {
          ...session,
          mfaAuthenticatedAt: new Date(now.getTime() - 15 * 60 * 1000 - 1),
        },
        now,
      ),
    ).toThrow(MfaRequiredError);
  });

  it("rejects missing, disabled, and restricted principals", () => {
    expect(() => requireUserPrincipal(null)).toThrow(AuthenticationError);
    expect(() => requireUserPrincipal({ ...user, status: "DISABLED" })).toThrow(
      AuthenticationError,
    );
    expect(() =>
      requireUserPrincipal({ ...user, status: "RESTRICTED" }),
    ).toThrow(AuthorizationError);
  });

  it("requires the verified super-admin role and an active account", () => {
    expect(() => requireSuperAdminPrincipal(user)).toThrow(AuthorizationError);
    expect(() =>
      requireSuperAdminPrincipal({
        ...user,
        role: "SUPER_ADMIN",
        status: "RESTRICTED",
        emailVerifiedAt: new Date(),
        mfaAuthenticatedAt: new Date(),
      }),
    ).toThrow(AuthorizationError);
    expect(() =>
      requireSuperAdminPrincipal({ ...user, role: "SUPER_ADMIN" }),
    ).toThrow(AuthorizationError);
    expect(
      requireSuperAdminPrincipal({
        ...user,
        role: "SUPER_ADMIN",
        emailVerifiedAt: new Date(),
        mfaAuthenticatedAt: new Date(),
      }).role,
    ).toBe("SUPER_ADMIN");
  });

  it("allows a verified administrator who has not enrolled in optional MFA", () => {
    const principal = {
      ...user,
      role: "SUPER_ADMIN" as const,
      emailVerifiedAt: new Date(),
    };
    expect(requireSuperAdminPrincipal(principal)).toBe(principal);
  });

  it("rejects password-only sessions after the administrator enrolls in MFA", () => {
    expect(() =>
      requireSuperAdminPrincipal({
        ...user,
        role: "SUPER_ADMIN",
        emailVerifiedAt: new Date(),
        mfaEnabled: true,
      }),
    ).toThrow(MfaRequiredError);
  });

  it("requires verification only for publishing-sensitive commands", () => {
    expect(requireUserPrincipal(user)).toBe(user);
    expect(() => requireVerifiedPublishingPrincipal(user)).toThrow(
      EmailVerificationRequiredError,
    );
    expect(
      requireVerifiedPublishingPrincipal({
        ...user,
        emailVerifiedAt: new Date(),
      }),
    ).toBeTruthy();
  });
});
