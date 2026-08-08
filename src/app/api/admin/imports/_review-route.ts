import {
  authorizeAdminService,
  createConfiguredAdminRateLimiter,
  enforceAdminRateLimit,
} from "@/modules/admin";
import { getCurrentSession } from "@/modules/auth";
import type { ListingImportReviewActor } from "@/modules/listing-imports";

import { assertAdminOrigin } from "../_shared";

export async function authorizeListingImportReview(
  request: Request,
  targetId: string,
): Promise<ListingImportReviewActor> {
  assertAdminOrigin(request);
  const session = await getCurrentSession();
  const administrator = authorizeAdminService(session?.principal ?? null);
  await enforceAdminRateLimit(
    createConfiguredAdminRateLimiter(),
    "LISTING_IMPORT",
    administrator.id,
    targetId,
  );
  return {
    userId: administrator.id,
    ...(session ? { sessionId: session.id } : {}),
  };
}
