import { z } from "zod";

import {
  createConfiguredAdminListingModeration,
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
} from "../../../_shared";

const schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmation: z.string().min(1).max(120),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
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
      "LISTING_MODERATION",
      administrator.id,
    );
    const input = schema.parse(await readAdminJson(request));
    const { eventId } = await params;
    const event = await createConfiguredAdminListingModeration().restore(
      session,
      {
        id: z.string().uuid().parse(eventId),
        ...input,
        requestId,
      },
    );
    return adminJson(
      { lifecycle: "ACTIVE", version: event.version, requestId },
      { requestId },
    );
  } catch (error) {
    return adminApiError(error, requestId, "admin.listing.restore", startedAt);
  }
}
