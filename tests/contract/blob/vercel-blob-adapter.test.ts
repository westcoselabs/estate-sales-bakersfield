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
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
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

  it("maps application authorization input into a private provider request", async () => {
    provider.issueSignedToken.mockResolvedValue({
      clientSigningToken: "client-token",
      delegationToken: "delegation-token",
    });
    provider.presignUrl.mockResolvedValue({
      presignedUrl: "https://blob.example.test/private-upload",
    });
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
      objectKey: "test/fixture-resource/opaque-reservation/random.jpg",
      method: "PUT",
      headers: {
        "x-vercel-blob-access": "private",
        "x-content-type": "image/jpeg",
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "0",
      },
    });
    expect(provider.issueSignedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "test/fixture-resource/opaque-reservation/random.jpg",
        operations: ["put"],
        maximumSizeInBytes: 1024,
      }),
    );
    expect(provider.presignUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ access: "private", addRandomSuffix: false }),
    );
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
