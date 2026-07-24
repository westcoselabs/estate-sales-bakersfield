import { NextResponse, type NextRequest } from "next/server";

import {
  createConfiguredPublicSearchService,
  enforcePublicSearchRateLimit,
  normalizeSearchQuery,
  PublicSearchCursorError,
  PublicSearchRateLimitError,
} from "@/modules/public-search";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  const parameters = new URLSearchParams(request.nextUrl.searchParams);
  const projection = parameters.getAll("projection");
  const explicitView = parameters.getAll("view");
  if (
    projection.length > 1 ||
    (projection[0] && projection[0] !== "list" && projection[0] !== "map") ||
    (projection.length === 1 && explicitView.length > 0)
  ) {
    return NextResponse.json(
      {
        schema: "public-search-v1",
        error: {
          code: "INVALID_PARAMETERS",
          message: "The search projection is invalid.",
        },
      },
      { status: 400, headers: noStoreHeaders },
    );
  }
  if (projection[0]) parameters.set("view", projection[0]);
  parameters.delete("projection");
  const normalized = normalizeSearchQuery(parameters);
  if (normalized.issue) {
    return NextResponse.json(
      {
        schema: "public-search-v1",
        criteria: normalized.criteria,
        error: normalized.issue,
      },
      { status: 400, headers: noStoreHeaders },
    );
  }
  try {
    await enforcePublicSearchRateLimit(
      request.headers,
      normalized.criteria.view,
    );
    const result = await createConfiguredPublicSearchService().search(
      normalized.criteria,
    );
    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof PublicSearchRateLimitError) {
      return NextResponse.json(
        {
          schema: "public-search-v1",
          error: {
            code: error.code,
            message:
              error.code === "RATE_LIMITED"
                ? "Please wait before searching again."
                : "Search protection is temporarily unavailable.",
          },
        },
        {
          status: error.code === "RATE_LIMITED" ? 429 : 503,
          headers: {
            ...noStoreHeaders,
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }
    if (error instanceof PublicSearchCursorError) {
      return NextResponse.json(
        {
          schema: "public-search-v1",
          criteria: normalized.criteria,
          error: {
            code: "INVALID_CURSOR",
            message: "This page cursor does not match the active search.",
          },
        },
        { status: 400, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      {
        schema: "public-search-v1",
        error: {
          code: "SEARCH_UNAVAILABLE",
          message: "Sale results are temporarily unavailable.",
        },
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
