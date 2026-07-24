import { NextResponse, type NextRequest } from "next/server";

import {
  AuthenticationServiceUnavailableError,
  AuthenticationError,
  PrismaAuthenticationRateLimiter,
  requireUser,
} from "@/modules/auth";
import {
  createConfiguredLocationProvider,
  createLocationSelectionToken,
  LocationProviderError,
} from "@/modules/locations";
import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { requestIdFrom } from "@/platform/http/request-context";
import { logger } from "@/platform/observability/logger";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

function json(
  body: unknown,
  requestId: string,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...noStoreHeaders,
      "X-Request-ID": requestId,
      ...headers,
    },
  });
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);
  try {
    const user = await requireUser();
    const keys = [...new Set(request.nextUrl.searchParams.keys())];
    const values = request.nextUrl.searchParams.getAll("q");
    if (
      keys.length !== 1 ||
      keys[0] !== "q" ||
      values.length !== 1 ||
      values[0]!.trim().length < 4 ||
      values[0]!.trim().length > 160
    ) {
      return json(
        {
          schema: "address-autocomplete-v1",
          error: {
            code: "INVALID_QUERY",
            message: "Enter more of the address.",
          },
        },
        requestId,
        400,
      );
    }

    const environment = getServerEnvironment();
    if (!environment.AUTH_FINGERPRINT_SECRET) {
      throw new AuthenticationServiceUnavailableError(
        "Location selection signing is unavailable",
      );
    }
    const selectionSigningSecret = environment.AUTH_FINGERPRINT_SECRET;
    const limiter = new PrismaAuthenticationRateLimiter(getPrismaClient(), {
      environment: environment.APP_ENV,
      ...(environment.TEST_RUN_ID ? { scope: environment.TEST_RUN_ID } : {}),
    });
    const decision = await limiter.consume({
      namespace: "location:autocomplete",
      identifier: user.id,
      limit: 30,
      windowSeconds: 60,
    });
    if (!decision.allowed) {
      return json(
        {
          schema: "address-autocomplete-v1",
          error: {
            code: "RATE_LIMITED",
            message: "Wait a moment before searching again.",
          },
        },
        requestId,
        429,
        { "Retry-After": String(decision.retryAfterSeconds) },
      );
    }

    const suggestions = await createConfiguredLocationProvider().autocomplete(
      values[0]!,
    );
    return json(
      {
        schema: "address-autocomplete-v1",
        suggestions: suggestions.map((suggestion) => ({
          ...suggestion,
          selectionToken: createLocationSelectionToken(
            suggestion,
            selectionSigningSecret,
          ),
        })),
      },
      requestId,
    );
  } catch (error) {
    if (error instanceof AuthenticationServiceUnavailableError) {
      return json(
        {
          schema: "address-autocomplete-v1",
          error: {
            code: "RATE_LIMIT_UNAVAILABLE",
            message: "Address search is temporarily unavailable.",
          },
        },
        requestId,
        503,
      );
    }
    if (error instanceof LocationProviderError) {
      logger.warn(
        { requestId, errorType: error.name },
        "Address autocomplete provider failed",
      );
      return json(
        {
          schema: "address-autocomplete-v1",
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "Address search is temporarily unavailable.",
          },
        },
        requestId,
        503,
      );
    }
    if (error instanceof AuthenticationError) {
      return json(
        {
          schema: "address-autocomplete-v1",
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication is required.",
          },
        },
        requestId,
        401,
      );
    }
    logger.error(
      {
        requestId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Unexpected address autocomplete failure",
    );
    return json(
      {
        schema: "address-autocomplete-v1",
        error: {
          code: "AUTOCOMPLETE_UNAVAILABLE",
          message: "Address search is temporarily unavailable.",
        },
      },
      requestId,
      503,
    );
  }
}
