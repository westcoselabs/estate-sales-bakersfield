import { z } from "zod";

import { createConfiguredListingImportReviewService } from "@/modules/listing-imports";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  adminApiError,
  adminJson,
  readAdminBoundedJson,
} from "../../../_shared";
import { authorizeListingImportReview } from "../../_review-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    const candidateId = z
      .string()
      .uuid()
      .parse((await params).candidateId);
    const actor = await authorizeListingImportReview(request, candidateId);
    const result =
      await createConfiguredListingImportReviewService().editCandidate(
        actor,
        candidateId,
        await readAdminBoundedJson(request),
        { requestId },
      );
    return adminJson(
      { schema: "listing-import-candidate.v1", candidate: result, requestId },
      { requestId },
    );
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.imports.candidates.update",
      startedAt,
    );
  }
}
