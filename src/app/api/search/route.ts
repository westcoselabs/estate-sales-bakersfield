import { NextResponse, type NextRequest } from "next/server";

import {
  createConfiguredPublicSearchService,
  normalizeSearchQuery,
  PublicSearchCursorError,
} from "@/modules/public-search";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("projection") === "map") {
    return NextResponse.json(
      {
        schema: "public-search-v1",
        error: {
          code: "MAP_PROJECTION_UNAVAILABLE",
          message: "The privacy-safe map projection is not configured.",
        },
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
  const normalized = normalizeSearchQuery(request.nextUrl.searchParams);
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
    const result = await createConfiguredPublicSearchService().search(
      normalized.criteria,
    );
    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch (error) {
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
