import "server-only";

import {
  HmacPrivacyFingerprint,
  PrismaAuthenticationRateLimiter,
} from "@/modules/auth";
import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";

export class PublicSearchRateLimitError extends Error {
  constructor(
    readonly code: "RATE_LIMITED" | "LIMITER_UNAVAILABLE",
    readonly retryAfterSeconds: number,
  ) {
    super(code);
  }
}

export async function enforcePublicSearchRateLimit(
  headers: Headers,
  view: "list" | "map",
): Promise<void> {
  const environment = getServerEnvironment();
  if (!environment.AUTH_FINGERPRINT_SECRET) {
    throw new PublicSearchRateLimitError("LIMITER_UNAVAILABLE", 30);
  }
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const network = forwarded || headers.get("x-real-ip") || "unknown";
  const userAgent = headers.get("user-agent") ?? "unknown";
  const identifier = new HmacPrivacyFingerprint(
    environment.AUTH_FINGERPRINT_SECRET,
  ).create(`${network}\u0000${userAgent}`);
  try {
    const decision = await new PrismaAuthenticationRateLimiter(
      getPrismaClient(),
      {
        environment: environment.APP_ENV,
        ...(environment.TEST_RUN_ID ? { scope: environment.TEST_RUN_ID } : {}),
      },
    ).consume({
      namespace: `public-search:${view}`,
      identifier,
      limit: view === "map" ? 20 : 60,
      windowSeconds: 60,
    });
    if (!decision.allowed) {
      throw new PublicSearchRateLimitError(
        "RATE_LIMITED",
        decision.retryAfterSeconds,
      );
    }
  } catch (error) {
    if (error instanceof PublicSearchRateLimitError) throw error;
    throw new PublicSearchRateLimitError("LIMITER_UNAVAILABLE", 30);
  }
}
