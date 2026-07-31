import { z } from "zod";

import {
  AuthenticationServiceUnavailableError,
  PrismaAuthenticationRateLimiter,
  requireSuperAdmin,
} from "@/modules/auth";
import { createConfiguredLocationProvider } from "@/modules/locations";
import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authJson,
  readJson,
} from "../../../auth/_shared";
import { eventApiError } from "../../../events/_shared";

export const dynamic = "force-dynamic";

const adminLocationResolutionSchema = z.object({
  addressLine1: z.string().trim().min(3).max(120),
  addressLine2: z.string().trim().max(120).nullable(),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(20),
  countryCode: z.literal("US"),
  timezone: z.literal("America/Los_Angeles"),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const administrator = await requireSuperAdmin();
    const environment = getServerEnvironment();
    const limiter = new PrismaAuthenticationRateLimiter(getPrismaClient(), {
      environment: environment.APP_ENV,
      ...(environment.TEST_RUN_ID ? { scope: environment.TEST_RUN_ID } : {}),
    });
    const decision = await limiter.consume({
      namespace: "location:admin-resolution",
      identifier: administrator.id,
      limit: 10,
      windowSeconds: 60,
    });
    if (!decision.allowed) {
      return authJson(
        {
          schema: "admin-location-resolution-v1",
          error: "Wait before resolving another location.",
          requestId,
        },
        {
          status: 429,
          requestId,
          headers: { "Retry-After": String(decision.retryAfterSeconds) },
        },
      );
    }

    const input = adminLocationResolutionSchema.parse(await readJson(request));
    const location = await createConfiguredLocationProvider().validate(input);
    return authJson(
      {
        schema: "admin-location-resolution-v1",
        location,
        requestId,
      },
      { requestId },
    );
  } catch (error) {
    if (error instanceof AuthenticationServiceUnavailableError) {
      return authJson(
        {
          schema: "admin-location-resolution-v1",
          error: "Location resolution is temporarily unavailable.",
          requestId,
        },
        { status: 503, requestId },
      );
    }
    return eventApiError(error, request, "admin.locations.resolve");
  }
}
