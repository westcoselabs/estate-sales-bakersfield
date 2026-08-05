import "server-only";

import {
  AuthenticationServiceUnavailableError,
  HmacPrivacyFingerprint,
  PrismaAuthenticationRateLimiter,
  RateLimitExceededError,
} from "@/modules/auth";
import type { PrivacyFingerprint, RateLimiter } from "@/modules/auth";
import { getServerEnvironment } from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";
import { networkIdentifierFrom } from "@/platform/http/request-context";

export const LISTING_INGESTION_RATE_LIMITS = {
  network: { limit: 60, windowSeconds: 60 },
  credential: { limit: 30, windowSeconds: 60 },
} as const;

function fingerprintValue(
  fingerprints: PrivacyFingerprint,
  kind: "network" | "credential",
  value: string,
): string {
  return fingerprints.create(`listing-ingestion:${kind}:v1\u0000${value}`);
}

export class ListingIngestionRateLimit {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly fingerprints: PrivacyFingerprint,
  ) {}

  async assertNetworkAllowed(request: Request): Promise<void> {
    await this.assertAllowed(
      "listing-ingestion:network",
      fingerprintValue(
        this.fingerprints,
        "network",
        networkIdentifierFrom(request),
      ),
      LISTING_INGESTION_RATE_LIMITS.network,
    );
  }

  async assertCredentialAllowed(credentialId: string): Promise<void> {
    if (
      credentialId.length < 1 ||
      credentialId.length > 256 ||
      credentialId.trim() !== credentialId
    ) {
      throw new Error("The ingestion credential identifier is invalid");
    }
    await this.assertAllowed(
      "listing-ingestion:credential",
      fingerprintValue(this.fingerprints, "credential", credentialId),
      LISTING_INGESTION_RATE_LIMITS.credential,
    );
  }

  private async assertAllowed(
    namespace: string,
    identifier: string,
    policy: { readonly limit: number; readonly windowSeconds: number },
  ): Promise<void> {
    const decision = await this.limiter.consume({
      namespace,
      identifier,
      ...policy,
    });
    if (!decision.allowed) {
      throw new RateLimitExceededError(decision.retryAfterSeconds);
    }
  }
}

export function createConfiguredListingIngestionRateLimit(): ListingIngestionRateLimit {
  const environment = getServerEnvironment();
  const secret = environment.AUTH_FINGERPRINT_SECRET;
  if (!secret) {
    throw new AuthenticationServiceUnavailableError(
      "Listing ingestion fingerprinting is not configured",
    );
  }
  return new ListingIngestionRateLimit(
    new PrismaAuthenticationRateLimiter(getPrismaClient(), {
      environment: environment.APP_ENV,
      ...(environment.TEST_RUN_ID ? { scope: environment.TEST_RUN_ID } : {}),
    }),
    new HmacPrivacyFingerprint(secret),
  );
}
