import { z } from "zod";

import {
  createConfiguredAdminMarketingExport,
  createConfiguredAdminRateLimiter,
  enforceAdminRateLimit,
} from "@/modules/admin";
import { getCurrentSession, requireSuperAdminPrincipal } from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  adminApiError,
  adminJson,
  assertAdminOrigin,
  readAdminJson,
} from "../../_shared";

const schema = z
  .object({ search: z.string().trim().max(320).default("") })
  .strict();

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
      "EXPORT",
      administrator.id,
    );
    const input = schema.parse(await readAdminJson(request));
    const preview = await createConfiguredAdminMarketingExport().preview(
      administrator,
      input.search,
    );
    return adminJson({ ...preview, requestId }, { requestId });
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.users.export-preview",
      startedAt,
    );
  }
}
