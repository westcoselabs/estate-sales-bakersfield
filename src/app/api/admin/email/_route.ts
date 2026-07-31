import { getCurrentSession, requireSuperAdminPrincipal } from "@/modules/auth";
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

export async function adminEmailMutation(
  request: Request,
  operation: string,
  action: "EMAIL_TEMPLATE" | "EMAIL_CAMPAIGN",
  execute: (input: {
    session: Awaited<ReturnType<typeof getCurrentSession>>;
    body: unknown;
    requestId: string;
  }) => Promise<unknown>,
) {
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
      action,
      administrator.id,
    );
    const body = await readAdminJson(request);
    const result = await execute({ session, body, requestId });
    return adminJson(result ?? { ok: true }, { requestId });
  } catch (error) {
    return adminApiError(error, requestId, operation, startedAt);
  }
}
