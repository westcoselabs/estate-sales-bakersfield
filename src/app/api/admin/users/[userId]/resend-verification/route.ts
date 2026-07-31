import { z } from "zod";

import {
  createConfiguredAdminRateLimiter,
  createConfiguredAdminUserManagement,
  enforceAdminRateLimit,
} from "@/modules/admin";
import {
  createConfiguredAuthenticationWorkflow,
  getCurrentSession,
  requireSuperAdminPrincipal,
} from "@/modules/auth";
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
    const targetId = z.string().uuid().parse(userId);
    await enforceAdminRateLimit(
      createConfiguredAdminRateLimiter(),
      "VERIFICATION_RESEND",
      administrator.id,
      targetId,
    );
    schema.parse(await readAdminJson(request));
    const target = await createConfiguredAdminUserManagement().resendTarget(
      administrator,
      targetId,
    );
    await createConfiguredAuthenticationWorkflow().resendVerification(
      target.normalizedEmail,
      { requestId, actorUserId: administrator.id },
    );
    return adminJson({ accepted: true, requestId }, { status: 202, requestId });
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.user.resend-verification",
      startedAt,
    );
  }
}
