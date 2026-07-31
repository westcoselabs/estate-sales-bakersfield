import { z } from "zod";

import {
  createConfiguredAdminMarketingExport,
  createConfiguredAdminRateLimiter,
  enforceAdminRateLimit,
} from "@/modules/admin";
import { getCurrentSession, requireSuperAdminPrincipal } from "@/modules/auth";
import { requestIdFrom } from "@/platform/http/request-context";

import { adminApiError, assertAdminOrigin, readAdminJson } from "../../_shared";

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
    const result = await createConfiguredAdminMarketingExport().export(
      session,
      input.search,
      requestId,
    );
    return new Response(result.bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition":
          'attachment; filename="marketing-eligible-contacts.csv"',
        "Content-Type": "text/csv; charset=utf-8",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Exported-Record-Count": String(result.count),
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    return adminApiError(error, requestId, "admin.users.export", startedAt);
  }
}
