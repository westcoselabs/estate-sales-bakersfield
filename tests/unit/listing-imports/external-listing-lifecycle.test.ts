import { describe, expect, it, vi } from "vitest";

import {
  ExternalListingLifecycleService,
  externalListingExpirationPayloadSchema,
  externalListingRevalidationPaths,
  type ExternalListingExpirationRepository,
  type ExternalListingExpirationResult,
} from "@/modules/listing-imports/application/external-listing-lifecycle";

const payload = {
  listingId: "10000000-0000-4000-8000-000000000001",
  version: 3,
  endsAt: "2026-08-08T22:00:00.000Z",
};

function repository(
  result: ExternalListingExpirationResult,
): ExternalListingExpirationRepository {
  return { expireExternalListing: vi.fn(async () => result) };
}

describe("external listing expiration", () => {
  it("accepts only a bounded versioned expiration payload", () => {
    expect(externalListingExpirationPayloadSchema.parse(payload)).toEqual(
      payload,
    );
    expect(() =>
      externalListingExpirationPayloadSchema.parse({
        ...payload,
        version: 0,
      }),
    ).toThrow();
    expect(() =>
      externalListingExpirationPayloadSchema.parse({
        ...payload,
        unexpected: true,
      }),
    ).toThrow();
  });

  it("revalidates collection and canonical paths after expiration and replay", async () => {
    const revalidate = vi.fn();
    const result = {
      disposition: "EXPIRED" as const,
      listingId: payload.listingId,
      version: 4,
      canonicalPath: "/estate-sales/example-abcdef123456",
    };
    const listings = repository(result);
    const service = new ExternalListingLifecycleService(listings, {
      revalidate,
    });

    await expect(
      service.expire(payload, {
        jobId: "20000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toEqual(result);
    expect(listings.expireExternalListing).toHaveBeenCalledWith({
      listingId: payload.listingId,
      expectedVersion: 3,
      expectedEndsAt: new Date(payload.endsAt),
      jobId: "20000000-0000-4000-8000-000000000001",
    });
    expect(revalidate).toHaveBeenCalledWith([
      "/",
      "/estate-sales",
      "/yard-sales",
      "/search",
      result.canonicalPath,
    ]);

    const replayRevalidate = vi.fn();
    const replay = new ExternalListingLifecycleService(
      repository({ ...result, disposition: "ALREADY_EXPIRED" }),
      { revalidate: replayRevalidate },
    );
    await replay.expire(payload);
    expect(replayRevalidate).toHaveBeenCalledOnce();
  });

  it.each([
    "NOT_FOUND",
    "STALE_VERSION",
    "END_DATE_CHANGED",
    "REMOVED",
  ] as const)("treats %s as an idempotent no-op", async (disposition) => {
    const revalidate = vi.fn();
    const service = new ExternalListingLifecycleService(
      repository({ disposition, listingId: payload.listingId }),
      { revalidate },
    );

    await expect(service.expire(payload)).resolves.toMatchObject({
      disposition,
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("retries a job that was claimed before the database says it is due", async () => {
    const service = new ExternalListingLifecycleService(
      repository({ disposition: "NOT_DUE", listingId: payload.listingId }),
      { revalidate: vi.fn() },
    );

    await expect(service.expire(payload)).rejects.toThrow(
      "EXTERNAL_LISTING_EXPIRATION_NOT_DUE",
    );
  });

  it("deduplicates shared and canonical revalidation paths", () => {
    expect(
      externalListingRevalidationPaths(
        "/estate-sales/example-abcdef123456",
        "/estate-sales/example-abcdef123456",
        null,
      ),
    ).toEqual([
      "/",
      "/estate-sales",
      "/yard-sales",
      "/search",
      "/estate-sales/example-abcdef123456",
    ]);
  });
});
