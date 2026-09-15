import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { MediaStore } from "../application/media-store";
import { MediaStoreError } from "../domain/errors";
import {
  createMediaObjectKey,
  parseMediaObjectKey,
} from "../domain/object-key";
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

export function verifyFileMediaSignature(input: {
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

export class FileMediaStore implements MediaStore {
  private readonly root: string;

  constructor(
    root: string,
    private readonly secret: string,
    private readonly applicationUrl: URL,
    readonly environment: "local" | "test" = "test",
  ) {
    if (process.env.APP_ENV !== this.environment) {
      throw new Error(
        "Filesystem media is limited to its matching Local or Test environment",
      );
    }
    const testRoot = resolve(this.environment === "local" ? ".local" : ".tmp");
    this.root = resolve(root);
    const relativePath = relative(testRoot, this.root);
    if (
      !relativePath ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new Error(
        "Filesystem media must stay inside its private runtime directory",
      );
    }
    if (secret.length < 32) {
      throw new Error(
        "Filesystem media signing requires at least 32 characters",
      );
    }
  }

  private path(key: MediaObjectKey): string {
    parseMediaObjectKey(key);
    if (!key.startsWith(`${this.environment}/`))
      throw new MediaStoreError(
        "INVALID_SCOPE",
        "The media environment does not match",
      );
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
    this.path(objectKey);
    if (
      !Number.isSafeInteger(input.maximumSizeInBytes) ||
      input.maximumSizeInBytes < 1 ||
      input.maximumSizeInBytes > 15 * 1024 * 1024
    )
      throw new MediaStoreError(
        "INVALID_SCOPE",
        "The upload size is not allowed",
      );
    const expires = String(input.expiresAt.getTime());
    const maximumSize = String(input.maximumSizeInBytes);
    const contentTypes = input.allowedContentTypes.join(",");
    const uploadUrl = new URL(
      this.environment === "local"
        ? "/api/local-media-upload"
        : "/api/test-media-upload",
      this.applicationUrl,
    );
    uploadUrl.searchParams.set("key", objectKey);
    uploadUrl.searchParams.set("expires", expires);
    uploadUrl.searchParams.set("maximumSize", maximumSize);
    uploadUrl.searchParams.set("contentTypes", contentTypes);
    uploadUrl.searchParams.set(
      "signature",
      signedValue(this.secret, objectKey, expires, maximumSize, contentTypes),
    );
    return {
      transport: this.environment === "local" ? "local-direct" : "test-direct",
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
        "Filesystem media inspection failed",
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
        throw new MediaStoreError(
          "NOT_FOUND",
          "Filesystem media object not found",
        );
      }
      throw new MediaStoreError(
        "PROVIDER_ERROR",
        "Filesystem media read failed",
        {
          cause: error,
        },
      );
    }
  }

  async createTemporaryReadUrl(
    key: MediaObjectKey,
    ttlSeconds: number,
  ): Promise<URL> {
    if (!(await this.inspect(key))) {
      throw new MediaStoreError(
        "NOT_FOUND",
        "Filesystem media object not found",
      );
    }
    const url = new URL(
      this.environment === "local"
        ? "/api/local-media-upload"
        : "/api/test-media-upload",
      this.applicationUrl,
    );
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
    let createdFile = false;
    let createdMetadata = false;
    try {
      await writeFile(target, bytes, { flag: "wx" });
      createdFile = true;
      await writeFile(
        this.metadataPath(key),
        JSON.stringify({ contentType, uploadedAt: new Date().toISOString() }),
        { flag: "wx" },
      );
      createdMetadata = true;
    } catch (error) {
      await Promise.all([
        ...(createdFile ? [rm(target, { force: true })] : []),
        ...(createdMetadata
          ? [rm(this.metadataPath(key), { force: true })]
          : []),
      ]);
      throw new MediaStoreError(
        "PROVIDER_ERROR",
        "Filesystem media write failed",
        {
          cause: error,
        },
      );
    }
  }

  async acceptAuthorizedUpload(request: Request): Promise<void> {
    if (process.env.APP_ENV !== this.environment) {
      throw new MediaStoreError(
        "ACCESS_DENIED",
        "Filesystem uploads are disabled",
      );
    }
    const url = new URL(request.url);
    const key = url.searchParams.get("key") ?? "";
    const expires = url.searchParams.get("expires") ?? "";
    const maximumSize = url.searchParams.get("maximumSize") ?? "";
    const contentTypes = url.searchParams.get("contentTypes") ?? "";
    const signature = url.searchParams.get("signature") ?? "";
    if (
      request.method !== "PUT" ||
      !verifyFileMediaSignature({
        secret: this.secret,
        key,
        expires,
        maximumSize,
        contentTypes,
        signature,
      }) ||
      !Number.isSafeInteger(Number(expires)) ||
      Date.now() >= Number(expires) ||
      !Number.isSafeInteger(Number(maximumSize)) ||
      Number(maximumSize) < 1 ||
      Number(maximumSize) > 15 * 1024 * 1024
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
    const objectKey = createMediaObjectKeyFromPersisted(key);
    this.path(objectKey);
    const reader = request.body?.getReader();
    if (!reader)
      throw new MediaStoreError("INVALID_SCOPE", "The upload is empty");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > Number(maximumSize)) {
          await reader.cancel();
          throw new MediaStoreError(
            "INVALID_SCOPE",
            "The upload size is not allowed",
          );
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, size);
    if (bytes.length === 0 || bytes.length > Number(maximumSize)) {
      throw new MediaStoreError(
        "INVALID_SCOPE",
        "The upload size is not allowed",
      );
    }
    await this.putPrivate(objectKey, bytes, contentType);
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
