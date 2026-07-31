import { z } from "zod";

import {
  createConfiguredAdminRateLimiter,
  createConfiguredAdminUserManagement,
  enforceAdminRateLimit,
} from "@/modules/admin";
import { getCurrentSession, requireSuperAdminPrincipal } from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  adminApiError,
  adminJson,
  assertAdminOrigin,
  readAdminJson,
} from "../../../_shared";

const schema = z.object({}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    assertAdminOrigin(request);
    const session = await getCurrentSession();
    const administrator = requireSuperAdminPrincipal(
      session?.principal ?? null,
    );
    const { userId } = await params;
    await enforceAdminRateLimit(
      createConfiguredAdminRateLimiter(),
      "USER_MANAGEMENT",
      administrator.id,
    );
    schema.parse(await readAdminJson(request));
    const revokedCount =
      await createConfiguredAdminUserManagement().revokeSessions(session, {
        targetId: z.string().uuid().parse(userId),
        requestId,
      });
    return adminJson({ revokedCount, requestId }, { requestId });
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.user.revoke-sessions",
      startedAt,
    );
  }
}
