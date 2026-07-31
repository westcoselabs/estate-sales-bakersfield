import {
  createConfiguredAuthenticationWorkflow,
  getCurrentSession,
  getCurrentSessionToken,
  requireSuperAdminPrincipal,
  setSessionCookie,
  superAdminReauthenticationSchema,
} from "@/modules/auth";
import {
  createConfiguredAdminRateLimiter,
  enforceAdminRateLimit,
} from "@/modules/admin";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  adminApiError,
  adminJson,
  assertAdminOrigin,
  readAdminJson,
} from "../_shared";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    assertAdminOrigin(request);
    const session = await getCurrentSession();
    const administrator = requireSuperAdminPrincipal(
      session?.principal ?? null,
    );
    await enforceAdminRateLimit(
      createConfiguredAdminRateLimiter(),
      "REAUTHENTICATE",
      administrator.id,
    );
    const input = superAdminReauthenticationSchema.parse(
      await readAdminJson(request),
    );
    const grant =
      await createConfiguredAuthenticationWorkflow().reauthenticateSuperAdmin(
        administrator,
        await getCurrentSessionToken(),
        input.password,
        request.headers.get("user-agent")
          ? { userAgent: request.headers.get("user-agent") as string }
          : {},
        { requestId, actorUserId: administrator.id },
      );
    await setSessionCookie(grant);
    return adminJson(
      {
        reauthenticatedAt: grant.session.passwordAuthenticatedAt.toISOString(),
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    return adminApiError(error, requestId, "admin.reauthenticate", startedAt);
  }
}
