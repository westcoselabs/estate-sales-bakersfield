import { AuthenticationError, AuthorizationError } from "../domain/errors";
import type { AuthPrincipal } from "../domain/types";

export function requireUserPrincipal(
  principal: AuthPrincipal | null,
): AuthPrincipal {
  if (!principal || principal.status === "DISABLED") {
    throw new AuthenticationError("Authentication is required");
  }
  return principal;
}

export function requireAdminPrincipal(
  principal: AuthPrincipal | null,
): AuthPrincipal {
  const user = requireUserPrincipal(principal);
  if (user.role !== "ADMIN" || user.status !== "ACTIVE") {
    throw new AuthorizationError("Administrator access is required");
  }
  return user;
}
