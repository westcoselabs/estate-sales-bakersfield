import {
  AuthenticationError,
  AuthorizationError,
  EmailVerificationRequiredError,
} from "../domain/errors";
import type { AuthPrincipal, CurrentSession } from "../domain/types";

export function requireUserPrincipal(
  principal: AuthPrincipal | null,
): AuthPrincipal {
  if (!principal || principal.status === "DISABLED") {
    throw new AuthenticationError("Authentication is required");
  }
  if (principal.status === "RESTRICTED") {
    throw new AuthorizationError("Account access is restricted");
  }
  return principal;
}

export function requireSuperAdminPrincipal(
  principal: AuthPrincipal | null,
): AuthPrincipal {
  const user = requireUserPrincipal(principal);
  if (
    user.role !== "SUPER_ADMIN" ||
    user.status !== "ACTIVE" ||
    !user.emailVerifiedAt
  ) {
    throw new AuthorizationError("Administrator access is required");
  }
  return user;
}

export function requireRecentSuperAdminSession(
  session: CurrentSession | null,
  now: Date = new Date(),
): CurrentSession {
  requireSuperAdminPrincipal(session?.principal ?? null);
  if (
    !session ||
    now.getTime() - session.passwordAuthenticatedAt.getTime() > 15 * 60 * 1000
  ) {
    throw new AuthorizationError("Recent password confirmation is required");
  }
  return session;
}

export function requireVerifiedPublishingPrincipal(
  principal: AuthPrincipal | null,
): AuthPrincipal {
  const user = requireUserPrincipal(principal);
  if (!user.emailVerifiedAt) {
    throw new EmailVerificationRequiredError(
      "Email verification is required for publishing actions",
    );
  }
  return user;
}
