import type { RateLimiter } from "@/modules/auth";
import {
  RateLimitExceededError,
  requireRecentSuperAdminSession,
  requireSuperAdminPrincipal,
} from "@/modules/auth";
import type { AuthPrincipal, CurrentSession } from "@/modules/auth";

export type AdminRateLimitAction =
  | "REAUTHENTICATE"
  | "EXPORT"
  | "USER_MANAGEMENT"
  | "VERIFICATION_RESEND"
  | "LISTING_MODERATION";

const ADMIN_LIMITS: Readonly<
  Record<AdminRateLimitAction, { limit: number; windowSeconds: number }>
> = {
  REAUTHENTICATE: { limit: 5, windowSeconds: 15 * 60 },
  EXPORT: { limit: 5, windowSeconds: 60 * 60 },
  USER_MANAGEMENT: { limit: 20, windowSeconds: 60 * 60 },
  VERIFICATION_RESEND: { limit: 20, windowSeconds: 60 * 60 },
  LISTING_MODERATION: { limit: 20, windowSeconds: 60 * 60 },
};

export function authorizeAdminService(
  principal: AuthPrincipal | null,
): AuthPrincipal {
  return requireSuperAdminPrincipal(principal);
}

export function authorizeRecentAdminService(
  session: CurrentSession | null,
): CurrentSession {
  return requireRecentSuperAdminSession(session);
}

export async function enforceAdminRateLimit(
  limiter: RateLimiter,
  action: AdminRateLimitAction,
  administratorId: string,
  targetId?: string,
): Promise<void> {
  const policy = ADMIN_LIMITS[action];
  const decisions = await Promise.all([
    limiter.consume({
      namespace: `admin:${action.toLowerCase()}`,
      identifier: administratorId,
      ...policy,
    }),
    ...(targetId
      ? [
          limiter.consume({
            namespace: `admin:${action.toLowerCase()}:target`,
            identifier: targetId,
            limit: action === "VERIFICATION_RESEND" ? 3 : policy.limit,
            windowSeconds: policy.windowSeconds,
          }),
        ]
      : []),
  ]);
  const denied = decisions.filter((decision) => !decision.allowed);
  if (denied.length > 0) {
    throw new RateLimitExceededError(
      Math.max(...denied.map((decision) => decision.retryAfterSeconds)),
    );
  }
}
