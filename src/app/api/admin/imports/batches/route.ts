import {
  authorizeRecentAdminService,
  createConfiguredAdminRateLimiter,
  enforceAdminRateLimit,
} from "@/modules/admin";
import { getCurrentSession } from "@/modules/auth";
import {
  createConfiguredListingImportService,
  parseListingImportCsv,
} from "@/modules/listing-imports";
import { readBoundedText } from "@/platform/http/bounded-body";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  adminApiError,
  adminJson,
  assertAdminOrigin,
  AdminUnsupportedMediaTypeError,
} from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mediaTypeFrom(request: Request): string {
  return (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);

  try {
    assertAdminOrigin(request);
    const session = authorizeRecentAdminService(await getCurrentSession());
    await enforceAdminRateLimit(
      createConfiguredAdminRateLimiter(),
      "LISTING_IMPORT",
      session.principal.id,
    );

    const mediaType = mediaTypeFrom(request);
    if (
      mediaType !== "application/json" &&
      mediaType !== "text/csv" &&
      mediaType !== "application/csv"
    ) {
      throw new AdminUnsupportedMediaTypeError(
        "Use application/json or text/csv.",
      );
    }

    const bodyText = await readBoundedText(request);
    const transport =
      mediaType === "application/json" ? "MANUAL_JSON" : "MANUAL_CSV";
    const input: unknown =
      transport === "MANUAL_JSON"
        ? JSON.parse(bodyText)
        : parseListingImportCsv(bodyText);
    const result = await createConfiguredListingImportService().importBatch(
      input,
      {
        transport,
        actor: {
          kind: "ADMIN_USER",
          adminUserId: session.principal.id,
        },
        audit: { requestId },
      },
    );

    return adminJson(result, {
      requestId,
      status: result.replayed ? 200 : 201,
    });
  } catch (error) {
    return adminApiError(
      error,
      requestId,
      "admin.imports.batches.create",
      startedAt,
    );
  }
}
