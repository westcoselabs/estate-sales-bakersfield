import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { MediaStore } from "@/modules/media/application/media-store";
import { MediaStoreError } from "@/modules/media/domain/errors";
import { createMediaObjectKey } from "@/modules/media/domain/object-key";
import type { MediaObjectKey, MediaScope } from "@/modules/media/domain/types";

import { InMemoryMediaStore } from "./in-memory-media-store";

const fixtureScope: MediaScope = {
  environment: "test",
  resourceScope: "contract-fixture",
  reservationId: "reservation-opaque-123",
  randomName: "fixture-abc123.jpg",
};

async function streamBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(target) : [target];
    }),
  );
  return nested.flat();
}

function runProviderNeutralContract(
  createStore: () => MediaStore & InMemoryMediaStore,
): void {
  it("supports authorization, metadata, reads, temporary access, and cleanup", async () => {
    const store = createStore();
    const expiresAt = new Date("2026-07-16T12:10:00.000Z");
    const authorization = await store.authorizePrivateUpload({
      scope: fixtureScope,
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: 1024,
      expiresAt,
    });
    const expectedKey =
      "test/contract-fixture/reservation-opaque-123/fixture-abc123.jpg";
    expect(authorization).toMatchObject({
      objectKey: expectedKey,
      method: "PUT",
      expiresAt,
    });

    const bytes = Uint8Array.from([1, 2, 3, 4]);
    store.putFixture(authorization.objectKey, bytes);
    await expect(store.inspect(authorization.objectKey)).resolves.toMatchObject(
      {
        objectKey: expectedKey,
        size: 4,
        contentType: "image/jpeg",
      },
    );
    expect(
      await streamBytes(await store.read(authorization.objectKey)),
    ).toEqual(bytes);
    await expect(
      store.createTemporaryReadUrl(authorization.objectKey, 60),
    ).resolves.toBeInstanceOf(URL);
    await store.delete(authorization.objectKey);
    await expect(store.inspect(authorization.objectKey)).resolves.toBeNull();
    await expect(store.read(authorization.objectKey)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
}

describe("MediaStore credential-free contract", () => {
  runProviderNeutralContract(() => new InMemoryMediaStore());

  it("generates domain-neutral opaque keys without event or photo records", () => {
    expect(createMediaObjectKey(fixtureScope)).toBe(
      "test/contract-fixture/reservation-opaque-123/fixture-abc123.jpg",
    );
  });

  it.each([
    ["resourceScope", "../event"],
    ["reservationId", "contains/slash"],
    ["randomName", "../secret.jpg"],
    ["randomName", ".hidden"],
  ] as const)("rejects unsafe %s key segments", (field, value) => {
    expect(() =>
      createMediaObjectKey({ ...fixtureScope, [field]: value }),
    ).toThrow(MediaStoreError);
  });

  it("reports accurate batch cleanup counts in the test double", async () => {
    const store = new InMemoryMediaStore();
    const first = createMediaObjectKey(fixtureScope);
    const second = createMediaObjectKey({
      ...fixtureScope,
      randomName: "second.jpg",
    });
    const absent = createMediaObjectKey({
      ...fixtureScope,
      randomName: "absent.jpg",
    });
    store.putFixture(first, Uint8Array.of(1));
    store.putFixture(second, Uint8Array.of(2));

    await expect(store.deleteMany([first, second, absent])).resolves.toEqual({
      requested: 3,
      deleted: 2,
    });
  });

  it("stores immutable private processed variants through the neutral boundary", async () => {
    const store = new InMemoryMediaStore();
    const key = createMediaObjectKey({
      ...fixtureScope,
      randomName: "variant.webp",
    });
    await store.putPrivate(key, Uint8Array.of(7, 8, 9), "image/webp");
    await expect(store.inspect(key)).resolves.toMatchObject({
      size: 3,
      contentType: "image/webp",
    });
    await expect(
      store.putPrivate(key, Uint8Array.of(1), "image/webp"),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("isolates Vercel SDK types and imports to the single infrastructure adapter", async () => {
    const root = path.resolve(process.cwd(), "src");
    const files = (await sourceFiles(root)).filter((file) =>
      /\.[cm]?[jt]sx?$/.test(file),
    );
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("@vercel/blob") &&
        !file.endsWith(
          path.join("media", "infrastructure", "vercel-blob-media-store.ts"),
        )
      ) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses application-owned branded keys at the provider boundary", () => {
    const key: MediaObjectKey = createMediaObjectKey(fixtureScope);
    expect(key.split("/")).toHaveLength(4);
  });
});
