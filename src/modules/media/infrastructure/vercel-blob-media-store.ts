import "server-only";

import {
  BlobAccessError,
  BlobNotFoundError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
} from "@vercel/blob";

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

function mapProviderError(error: unknown): MediaStoreError {
  if (error instanceof MediaStoreError) return error;
  if (error instanceof BlobNotFoundError) {
    return new MediaStoreError("NOT_FOUND", "The media object was not found", {
      cause: error,
    });
  }
  if (error instanceof BlobStoreNotFoundError) {
    return new MediaStoreError(
      "PROVIDER_ERROR",
      "The configured media store was not found",
      {
        cause: error,
      },
    );
  }
  if (
    error instanceof BlobAccessError ||
    error instanceof BlobStoreSuspendedError
  ) {
    return new MediaStoreError(
      "ACCESS_DENIED",
      "The media store rejected access",
      {
        cause: error,
      },
    );
  }
  if (error instanceof BlobServiceRateLimited) {
    return new MediaStoreError(
      "RATE_LIMITED",
      "The media provider rate limited the request",
      {
        cause: error,
      },
    );
  }
  if (error instanceof BlobServiceNotAvailable) {
    return new MediaStoreError(
      "PROVIDER_UNAVAILABLE",
      "The media provider is unavailable",
      {
        cause: error,
      },
    );
  }
  return new MediaStoreError(
    "PROVIDER_ERROR",
    "The media provider request failed",
    {
      cause: error,
    },
  );
}

export class VercelBlobMediaStore implements MediaStore {
  constructor(private readonly token: string) {
    if (!token)
      throw new MediaStoreError(
        "ACCESS_DENIED",
        "A Blob credential is required",
      );
  }

  async authorizePrivateUpload(
    input: UploadAuthorizationInput,
  ): Promise<UploadAuthorization> {
    const objectKey = createMediaObjectKey(input.scope);
    try {
      const signedToken = await issueSignedToken({
        token: this.token,
        pathname: objectKey,
        operations: ["put"],
        validUntil: input.expiresAt.getTime(),
        allowedContentTypes: [...input.allowedContentTypes],
        maximumSizeInBytes: input.maximumSizeInBytes,
      });
      const { presignedUrl } = await presignUrl(signedToken, {
        access: "private",
        operation: "put",
        pathname: objectKey,
        validUntil: input.expiresAt.getTime(),
        allowedContentTypes: [...input.allowedContentTypes],
        maximumSizeInBytes: input.maximumSizeInBytes,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      return {
        objectKey,
        uploadUrl: new URL(presignedUrl),
        method: "PUT",
        expiresAt: input.expiresAt,
      };
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  async inspect(key: MediaObjectKey): Promise<MediaObjectMetadata | null> {
    try {
      const result = await head(key, { token: this.token });
      return {
        objectKey: key,
        size: result.size,
        contentType: result.contentType,
        etag: result.etag,
        uploadedAt: result.uploadedAt,
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw mapProviderError(error);
    }
  }

  async read(key: MediaObjectKey): Promise<ReadableStream<Uint8Array>> {
    try {
      const result = await get(key, {
        access: "private",
        token: this.token,
        useCache: false,
      });
      if (!result || result.statusCode !== 200) {
        throw new MediaStoreError(
          "NOT_FOUND",
          "The media object was not found",
        );
      }
      return result.stream;
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  async createTemporaryReadUrl(
    key: MediaObjectKey,
    ttlSeconds: number,
  ): Promise<URL> {
    const boundedTtlSeconds = Math.min(
      Math.max(Math.floor(ttlSeconds), 1),
      60 * 60,
    );
    const validUntil = Date.now() + boundedTtlSeconds * 1000;
    try {
      const signedToken = await issueSignedToken({
        token: this.token,
        pathname: key,
        operations: ["get"],
        validUntil,
      });
      const { presignedUrl } = await presignUrl(signedToken, {
        access: "private",
        operation: "get",
        pathname: key,
        validUntil,
        useCache: false,
      });
      return new URL(presignedUrl);
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  async putPrivate(
    key: MediaObjectKey,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    try {
      await put(key, Buffer.from(bytes), {
        access: "private",
        token: this.token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
      });
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  async delete(key: MediaObjectKey): Promise<void> {
    try {
      await del(key, { token: this.token });
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  async deleteMany(
    keys: readonly MediaObjectKey[],
  ): Promise<BatchDeleteResult> {
    if (keys.length === 0) return { requested: 0, deleted: 0 };
    try {
      await del([...keys], { token: this.token });
      return { requested: keys.length, deleted: keys.length };
    } catch (error) {
      throw mapProviderError(error);
    }
  }
}
