import { describe, expect, it, vi } from "vitest";

import type {
  PrivacyFingerprint,
  RateLimitDecision,
  RateLimiter,
  RateLimitExceededError,
} from "@/modules/auth";
import {
  LISTING_INGESTION_RATE_LIMITS,
  ListingIngestionRateLimit,
} from "@/modules/listing-imports/infrastructure/ingestion-rate-limit";

function limiterWith(...decisions: readonly RateLimitDecision[]): {
  readonly limiter: RateLimiter;
  readonly consume: ReturnType<typeof vi.fn>;
} {
  const consume = vi.fn();
  for (const decision of decisions) {
    consume.mockResolvedValueOnce(decision);
  }
  return { limiter: { consume }, consume };
}

function fingerprintWith(value = "privacy-safe-fingerprint"): {
  readonly fingerprints: PrivacyFingerprint;
  readonly create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(() => value);
  return { fingerprints: { create }, create };
}

const allowed: RateLimitDecision = {
  allowed: true,
  remaining: 10,
  retryAfterSeconds: 60,
};

describe("ListingIngestionRateLimit", () => {
  it("enforces the network bucket before credential authentication", async () => {
    const rateLimiter = limiterWith(allowed, allowed);
    const fingerprint = fingerprintWith();
    const ingestion = new ListingIngestionRateLimit(
      rateLimiter.limiter,
      fingerprint.fingerprints,
    );
    const request = new Request("http://localhost/api/ingestion", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.2" },
    });

    await ingestion.assertNetworkAllowed(request);
    expect(rateLimiter.consume).toHaveBeenCalledOnce();
    expect(rateLimiter.consume).toHaveBeenLastCalledWith({
      namespace: "listing-ingestion:network",
      identifier: "privacy-safe-fingerprint",
      ...LISTING_INGESTION_RATE_LIMITS.network,
    });
    expect(fingerprint.create).toHaveBeenLastCalledWith(
      "listing-ingestion:network:v1\u0000203.0.113.10",
    );

    await ingestion.assertCredentialAllowed("credential_123");
    expect(rateLimiter.consume).toHaveBeenCalledTimes(2);
    expect(rateLimiter.consume).toHaveBeenLastCalledWith({
      namespace: "listing-ingestion:credential",
      identifier: "privacy-safe-fingerprint",
      ...LISTING_INGESTION_RATE_LIMITS.credential,
    });
    expect(fingerprint.create).toHaveBeenLastCalledWith(
      "listing-ingestion:credential:v1\u0000credential_123",
    );
  });

  it.each([
    ["network", 17],
    ["credential", 29],
  ] as const)(
    "throws a deterministic RateLimitExceededError for a denied %s bucket",
    async (bucket, retryAfterSeconds) => {
      const rateLimiter = limiterWith({
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      });
      const ingestion = new ListingIngestionRateLimit(
        rateLimiter.limiter,
        fingerprintWith().fingerprints,
      );
      const operation =
        bucket === "network"
          ? ingestion.assertNetworkAllowed(new Request("http://localhost"))
          : ingestion.assertCredentialAllowed("credential_123");

      await expect(operation).rejects.toMatchObject({
        name: "RateLimitExceededError",
        retryAfterSeconds,
      } satisfies Partial<RateLimitExceededError>);
    },
  );

  it("does not create a shared credential bucket for an invalid identifier", async () => {
    const rateLimiter = limiterWith(allowed);
    const ingestion = new ListingIngestionRateLimit(
      rateLimiter.limiter,
      fingerprintWith().fingerprints,
    );

    await expect(ingestion.assertCredentialAllowed(" ")).rejects.toThrow(
      "credential identifier is invalid",
    );
    expect(rateLimiter.consume).not.toHaveBeenCalled();
  });
});
