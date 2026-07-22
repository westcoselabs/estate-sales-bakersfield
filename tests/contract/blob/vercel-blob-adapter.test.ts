import {
  BlobNotFoundError,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
} from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaStoreError } from "@/modules/media/domain/errors";
import { createMediaObjectKey } from "@/modules/media/domain/object-key";

const provider = vi.hoisted(() => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
}));

vi.mock("@vercel/blob", async () => {
  const original =
    await vi.importActual<Record<string, unknown>>("@vercel/blob");
  return { ...original, ...provider };
});

const { VercelBlobMediaStore } =
  await import("@/modules/media/infrastructure/vercel-blob-media-store");

describe("VercelBlobMediaStore error and input mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allocates a bounded pathname for the supported client upload flow", async () => {
    const store = new VercelBlobMediaStore("non-production-test-token");
    const expiresAt = new Date("2026-07-16T12:10:00.000Z");

    await expect(
      store.authorizePrivateUpload({
        scope: {
          environment: "test",
          resourceScope: "fixture-resource",
          reservationId: "opaque-reservation",
          randomName: "random.jpg",
        },
        allowedContentTypes: ["image/jpeg"],
        maximumSizeInBytes: 1024,
        expiresAt,
      }),
    ).resolves.toMatchObject({
      transport: "vercel-client",
      objectKey: "test/fixture-resource/opaque-reservation/random.jpg",
      expiresAt,
    });
    expect(provider.del).not.toHaveBeenCalled();
    expect(provider.head).not.toHaveBeenCalled();
  });

  it("maps provider not-found responses to null metadata", async () => {
    provider.head.mockRejectedValue(new BlobNotFoundError());
    const store = new VercelBlobMediaStore("non-production-test-token");
    const key = createMediaObjectKey({
      environment: "test",
      resourceScope: "fixture-resource",
      reservationId: "opaque-reservation",
      randomName: "missing.jpg",
    });

    await expect(store.inspect(key)).resolves.toBeNull();
  });

  it("maps provider rate limits into application-owned error codes", async () => {
    provider.del.mockRejectedValue(new BlobServiceRateLimited(10));
    const store = new VercelBlobMediaStore("non-production-test-token");
    const key = createMediaObjectKey({
      environment: "test",
      resourceScope: "fixture-resource",
      reservationId: "opaque-reservation",
      randomName: "fixture.jpg",
    });

    const error = await store.delete(key).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MediaStoreError);
    expect(error).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("does not misreport a missing provider store as an absent object", async () => {
    provider.head.mockRejectedValue(new BlobStoreNotFoundError());
    const store = new VercelBlobMediaStore("non-production-test-token");
    const key = createMediaObjectKey({
      environment: "test",
      resourceScope: "fixture-resource",
      reservationId: "opaque-reservation",
      randomName: "fixture.jpg",
    });

    await expect(store.inspect(key)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
});
