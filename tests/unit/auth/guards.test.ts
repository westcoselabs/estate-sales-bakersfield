import { describe, expect, it } from "vitest";

import {
  requireAdminPrincipal,
  requireUserPrincipal,
} from "@/modules/auth/application/guards";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/modules/auth/domain/errors";
import type { AuthPrincipal } from "@/modules/auth/domain/types";

const user: AuthPrincipal = {
  id: "user-1",
  email: "person@example.test",
  emailVerifiedAt: null,
  role: "USER",
  status: "ACTIVE",
};

describe("authorization guards", () => {
  it("returns a narrow authenticated principal", () => {
    expect(requireUserPrincipal(user)).toBe(user);
  });

  it("rejects missing and disabled principals", () => {
    expect(() => requireUserPrincipal(null)).toThrow(AuthenticationError);
    expect(() => requireUserPrincipal({ ...user, status: "DISABLED" })).toThrow(
      AuthenticationError,
    );
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
});
