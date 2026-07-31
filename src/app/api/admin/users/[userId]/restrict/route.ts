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

const schema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();

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
    const input = schema.parse(await readAdminJson(request));
    const user = await createConfiguredAdminUserManagement().restrict(session, {
      targetId: z.string().uuid().parse(userId),
      reason: input.reason,
      expectedUpdatedAt: new Date(input.expectedUpdatedAt),
      requestId,
    });
    return adminJson(
      { status: user.status, updatedAt: user.updatedAt, requestId },
      { requestId },
    );
  } catch (error) {
    return adminApiError(error, requestId, "admin.user.restrict", startedAt);
  }
}
