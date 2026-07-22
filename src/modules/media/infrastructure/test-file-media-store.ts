import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { MediaStore } from "../application/media-store";
import { MediaStoreError } from "../domain/errors";
import { createMediaObjectKey } from "../domain/object-key";
import type {
  BatchDeleteResult,
  MediaObjectKey,
  MediaObjectMetadata,
  UploadAuthorization,
  UploadAuthorizationInput,
} from "../domain/types";

interface StoredMetadata {
  readonly contentType: string;
  readonly uploadedAt: string;
}

function signedValue(
  secret: string,
  key: string,
  expires: string,
  maximumSize: string,
  contentTypes: string,
): string {
  return createHmac("sha256", secret)
    .update([key, expires, maximumSize, contentTypes].join("\n"))
    .digest("base64url");
}

export function verifyTestMediaSignature(input: {
  readonly secret: string;
  readonly key: string;
  readonly expires: string;
  readonly maximumSize: string;
  readonly contentTypes: string;
  readonly signature: string;
}): boolean {
  const expected = Buffer.from(
    signedValue(
      input.secret,
      input.key,
      input.expires,
      input.maximumSize,
      input.contentTypes,
    ),
  );
  const received = Buffer.from(input.signature);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export class TestFileMediaStore implements MediaStore {
  private readonly root: string;

  constructor(
    root: string,
    private readonly secret: string,
    private readonly applicationUrl: URL,
  ) {
    if (process.env.APP_ENV !== "test") {
      throw new Error("The filesystem media adapter is test-only");
    }
    const testRoot = resolve(".tmp");
    this.root = resolve(root);
    const relativePath = relative(testRoot, this.root);
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new Error("Test media must stay inside .tmp");
    }
    if (secret.length < 32) {
      throw new Error("Test media signing requires at least 32 characters");
    }
  }

  private path(key: MediaObjectKey): string {
    const target = resolve(this.root, ...key.split("/"));
    const relativePath = relative(this.root, target);
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new MediaStoreError("INVALID_SCOPE", "The media key is invalid");
    }
    return target;
  }

  private metadataPath(key: MediaObjectKey): string {
    return `${this.path(key)}.metadata.json`;
  }

  async authorizePrivateUpload(
    input: UploadAuthorizationInput,
  ): Promise<UploadAuthorization> {
    const objectKey = createMediaObjectKey(input.scope);
    const expires = String(input.expiresAt.getTime());
    const maximumSize = String(input.maximumSizeInBytes);
    const contentTypes = input.allowedContentTypes.join(",");
    const uploadUrl = new URL("/api/test-media-upload", this.applicationUrl);
    uploadUrl.searchParams.set("key", objectKey);
    uploadUrl.searchParams.set("expires", expires);
    uploadUrl.searchParams.set("maximumSize", maximumSize);
    uploadUrl.searchParams.set("contentTypes", contentTypes);
    uploadUrl.searchParams.set(
      "signature",
      signedValue(this.secret, objectKey, expires, maximumSize, contentTypes),
    );
    return {
      objectKey,
      uploadUrl,
      method: "PUT",
      headers: {},
      expiresAt: input.expiresAt,
    };
  }

  async inspect(key: MediaObjectKey): Promise<MediaObjectMetadata | null> {
    try {
      const [details, metadataText] = await Promise.all([
        stat(this.path(key)),
        readFile(this.metadataPath(key), "utf8"),
      ]);
      const metadata = JSON.parse(metadataText) as StoredMetadata;
      return {
        objectKey: key,
        size: details.size,
        contentType: metadata.contentType,
        etag: `test-${String(details.size)}-${String(details.mtimeMs)}`,
        uploadedAt: new Date(metadata.uploadedAt),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new MediaStoreError(
        "PROVIDER_ERROR",
        "Test media inspection failed",
        {
          cause: error,
        },
      );
    }
  }

  async read(key: MediaObjectKey): Promise<ReadableStream<Uint8Array>> {
    try {
      const bytes = await readFile(this.path(key));
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new MediaStoreError("NOT_FOUND", "Test media object not found");
      }
      throw new MediaStoreError("PROVIDER_ERROR", "Test media read failed", {
        cause: error,
      });
    }
  }

  async createTemporaryReadUrl(
    key: MediaObjectKey,
    ttlSeconds: number,
  ): Promise<URL> {
    if (!(await this.inspect(key))) {
      throw new MediaStoreError("NOT_FOUND", "Test media object not found");
    }
    const url = new URL("/api/test-media-upload", this.applicationUrl);
    url.searchParams.set("key", key);
    url.searchParams.set("ttl", String(ttlSeconds));
    return url;
  }

  async putPrivate(
    key: MediaObjectKey,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, bytes, { flag: "wx" });
      await writeFile(
        this.metadataPath(key),
        JSON.stringify({ contentType, uploadedAt: new Date().toISOString() }),
        { flag: "wx" },
      );
    } catch (error) {
      await Promise.all([
        rm(target, { force: true }),
        rm(this.metadataPath(key), { force: true }),
      ]);
      throw new MediaStoreError("PROVIDER_ERROR", "Test media write failed", {
        cause: error,
      });
    }
  }

  async acceptAuthorizedUpload(request: Request): Promise<void> {
    if (process.env.APP_ENV !== "test") {
      throw new MediaStoreError("ACCESS_DENIED", "Test uploads are disabled");
    }
    const url = new URL(request.url);
    const key = url.searchParams.get("key") ?? "";
    const expires = url.searchParams.get("expires") ?? "";
    const maximumSize = url.searchParams.get("maximumSize") ?? "";
    const contentTypes = url.searchParams.get("contentTypes") ?? "";
    const signature = url.searchParams.get("signature") ?? "";
    if (
      request.method !== "PUT" ||
      !verifyTestMediaSignature({
        secret: this.secret,
        key,
        expires,
        maximumSize,
        contentTypes,
        signature,
      }) ||
      !Number.isSafeInteger(Number(expires)) ||
      Date.now() >= Number(expires)
    ) {
      throw new MediaStoreError(
        "ACCESS_DENIED",
        "Upload authorization is invalid",
      );
    }
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentTypes.split(",").includes(contentType)) {
      throw new MediaStoreError(
        "INVALID_SCOPE",
        "The upload type is not allowed",
      );
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0 || bytes.length > Number(maximumSize)) {
      throw new MediaStoreError(
        "INVALID_SCOPE",
        "The upload size is not allowed",
      );
    }
    await this.putPrivate(
      createMediaObjectKeyFromPersisted(key),
      bytes,
      contentType,
    );
  }

  async delete(key: MediaObjectKey): Promise<void> {
    await Promise.all([
      rm(this.path(key), { force: true }),
      rm(this.metadataPath(key), { force: true }),
    ]);
  }

  async deleteMany(
    keys: readonly MediaObjectKey[],
  ): Promise<BatchDeleteResult> {
    let deleted = 0;
    for (const key of keys) {
      if (await this.inspect(key)) deleted += 1;
      await this.delete(key);
    }
    return { requested: keys.length, deleted };
  }
}

function createMediaObjectKeyFromPersisted(value: string): MediaObjectKey {
  const parts = value.split("/");
  if (parts.length !== 4) {
    throw new MediaStoreError("INVALID_SCOPE", "The media key is invalid");
  }
  const [environment, resourceScope, reservationId, randomName] = parts;
  if (!environment || !resourceScope || !reservationId || !randomName) {
    throw new MediaStoreError("INVALID_SCOPE", "The media key is invalid");
  }
  return createMediaObjectKey({
    environment:
      environment as UploadAuthorizationInput["scope"]["environment"],
    resourceScope,
    reservationId,
    randomName,
  });
}
