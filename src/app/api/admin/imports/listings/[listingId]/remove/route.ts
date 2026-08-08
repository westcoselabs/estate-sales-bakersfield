import { z } from "zod";

import { createConfiguredListingImportReviewService } from "@/modules/listing-imports";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  adminApiError,
  adminJson,
  readAdminBoundedJson,
} from "../../../../_shared";
import { authorizeListingImportReview } from "../../../_review-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    const listingId = z
      .string()
      .uuid()
      .parse((await params).listingId);
    const actor = await authorizeListingImportReview(request, listingId);
    const result =
      await createConfiguredListingImportReviewService().removeExternalListing(
        actor,
        listingId,
        await readAdminBoundedJson(request),
        { requestId },
      );
    return adminJson(
      { schema: "external-listing-review.v1", listing: result, requestId },
      { requestId },
    );
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.imports.listings.remove",
      startedAt,
    );
  }
}
