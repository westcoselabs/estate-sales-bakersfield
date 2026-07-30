import { describe, expect, it } from "vitest";

import {
  requireAdminPrincipal,
  requireUserPrincipal,
  requireVerifiedPublishingPrincipal,
} from "@/modules/auth/application/guards";
import {
  AuthenticationError,
  AuthorizationError,
  EmailVerificationRequiredError,
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

  it("rejects missing, disabled, and restricted principals", () => {
    expect(() => requireUserPrincipal(null)).toThrow(AuthenticationError);
    expect(() => requireUserPrincipal({ ...user, status: "DISABLED" })).toThrow(
      AuthenticationError,
    );
    expect(() =>
      requireUserPrincipal({ ...user, status: "RESTRICTED" }),
    ).toThrow(AuthorizationError);
  });

  it("requires both the admin role and an active account", () => {
    expect(() => requireAdminPrincipal(user)).toThrow(AuthorizationError);
    expect(() =>
      requireAdminPrincipal({ ...user, role: "ADMIN", status: "RESTRICTED" }),
    ).toThrow(AuthorizationError);
    expect(requireAdminPrincipal({ ...user, role: "ADMIN" }).role).toBe(
      "ADMIN",
    );
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
