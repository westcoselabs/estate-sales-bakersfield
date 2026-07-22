import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { VercelBlobMediaStore } from "@/modules/media/infrastructure/vercel-blob-media-store";

async function bytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("Vercel Private Blob live contract", () => {
  it("allocates, uploads, inspects, reads, signs, deletes, and confirms absence", async () => {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token)
      throw new Error(
        "BLOB_READ_WRITE_TOKEN must be preflighted by the live runner",
      );
    const store = new VercelBlobMediaStore(token);
    const fixture = new TextEncoder().encode(
      `phase-1-live-contract:${randomUUID()}`,
    );
    const authorization = await store.authorizePrivateUpload({
      scope: {
        environment: "test",
        resourceScope: "live-contract",
        reservationId: randomUUID(),
        randomName: `${randomUUID()}.txt`,
      },
      allowedContentTypes: ["text/plain"],
      maximumSizeInBytes: 1024,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    try {
      expect(authorization.transport).toBe("vercel-client");
      await store.putPrivate(authorization.objectKey, fixture, "text/plain");

      await expect(
        store.inspect(authorization.objectKey),
      ).resolves.toMatchObject({
        objectKey: authorization.objectKey,
        size: fixture.byteLength,
        contentType: "text/plain",
      });
      expect(await bytes(await store.read(authorization.objectKey))).toEqual(
        fixture,
      );

      const temporaryUrl = await store.createTemporaryReadUrl(
        authorization.objectKey,
        60,
      );
      const temporaryRead = await fetch(temporaryUrl);
      expect(temporaryRead.ok).toBe(true);
      expect(new Uint8Array(await temporaryRead.arrayBuffer())).toEqual(
        fixture,
      );

      await store.delete(authorization.objectKey);
      await expect(store.inspect(authorization.objectKey)).resolves.toBeNull();
    } finally {
      await store.delete(authorization.objectKey).catch(() => undefined);
    }
  });
});
