import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileMediaStore } from "@/modules/media/infrastructure/file-media-store";
import { createMediaObjectKey } from "@/modules/media/domain/object-key";

let root: string;
let store: FileMediaStore;
const scope = {
  environment: "local" as const,
  resourceScope: "event-fixture",
  reservationId: "reservation-123",
  randomName: "source.bin",
};
beforeEach(async () => {
  vi.stubEnv("APP_ENV", "local");
  await mkdir(resolve(".local"), { recursive: true });
  root = await mkdtemp(resolve(".local/media-test-"));
  store = new FileMediaStore(
    root,
    "s".repeat(40),
    new URL("http://localhost:3000"),
    "local",
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (!root.startsWith(`${resolve(".local")}${sep}`))
    throw new Error("Refusing cleanup outside the local fixture directory");
  await rm(root, { recursive: true, force: true });
});
async function authorization(maximumSizeInBytes = 1024) {
  const result = await store.authorizePrivateUpload({
    scope,
    allowedContentTypes: ["image/jpeg"],
    maximumSizeInBytes,
    expiresAt: new Date(Date.now() + 60_000),
  });
  if (result.transport === "vercel-client")
    throw new Error("Expected local direct storage");
  return result;
}
const request = (url: URL, body = "photo", type = "image/jpeg") =>
  new Request(url, { method: "PUT", headers: { "Content-Type": type }, body });

describe("private local file media", () => {
  it("stores signed uploads and reads them again through a new store instance", async () => {
    const upload = await authorization();
    expect(upload.transport).toBe("local-direct");
    expect(upload.uploadUrl.pathname).toBe("/api/local-media-upload");
    await store.acceptAuthorizedUpload(request(upload.uploadUrl));
    const reopened = new FileMediaStore(
      root,
      "s".repeat(40),
      new URL("http://localhost:3000"),
      "local",
    );
    expect(await reopened.inspect(upload.objectKey)).toMatchObject({
      size: 5,
      contentType: "image/jpeg",
    });
    expect(
      await new Response(await reopened.read(upload.objectKey)).text(),
    ).toBe("photo");
    await reopened.delete(upload.objectKey);
    expect(await reopened.inspect(upload.objectKey)).toBeNull();
  });
  it("rejects replay without deleting the original upload", async () => {
    const upload = await authorization();
    await store.acceptAuthorizedUpload(request(upload.uploadUrl));
    await expect(
      store.acceptAuthorizedUpload(request(upload.uploadUrl, "replacement")),
    ).rejects.toThrow();
    expect(await new Response(await store.read(upload.objectKey)).text()).toBe(
      "photo",
    );
  });
  it("rejects changed signatures and parameters without writing files", async () => {
    const upload = await authorization();
    for (const [name, value] of [
      ["key", "local/other/reservation/source.bin"],
      ["maximumSize", "9000"],
      ["signature", "forged"],
    ]) {
      const url = new URL(upload.uploadUrl);
      url.searchParams.set(name!, value!);
      await expect(store.acceptAuthorizedUpload(request(url))).rejects.toThrow(
        /authorization is invalid/,
      );
    }
    expect(await store.inspect(upload.objectKey)).toBeNull();
  });
  it("rejects expired, oversized, empty, and wrong-type uploads", async () => {
    const upload = await authorization(4);
    await expect(
      store.acceptAuthorizedUpload(request(upload.uploadUrl)),
    ).rejects.toThrow(/size/);
    await expect(
      store.acceptAuthorizedUpload(request(upload.uploadUrl, "")),
    ).rejects.toThrow();
    await expect(
      store.acceptAuthorizedUpload(request(upload.uploadUrl, "x", "text/html")),
    ).rejects.toThrow(/type/);
    const expired = await store.authorizePrivateUpload({
      scope,
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: 10,
      expiresAt: new Date(0),
    });
    if (expired.transport === "vercel-client")
      throw new Error("Expected local upload");
    await expect(
      store.acceptAuthorizedUpload(request(expired.uploadUrl)),
    ).rejects.toThrow(/authorization is invalid/);
    expect(await store.inspect(upload.objectKey)).toBeNull();
  });
  it("rejects environment and directory escapes", async () => {
    expect(
      () =>
        new FileMediaStore(
          resolve("public/media"),
          "s".repeat(40),
          new URL("http://localhost:3000"),
          "local",
        ),
    ).toThrow(/private runtime directory/);
    await expect(
      store.putPrivate(
        createMediaObjectKey({ ...scope, environment: "production" }),
        new Uint8Array([1]),
        "image/jpeg",
      ),
    ).rejects.toThrow(/environment/);
    vi.stubEnv("APP_ENV", "production");
    expect(
      () =>
        new FileMediaStore(
          root,
          "s".repeat(40),
          new URL("http://localhost:3000"),
          "local",
        ),
    ).toThrow(/matching Local or Test/);
  });
});
