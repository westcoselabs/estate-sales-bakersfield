import "server-only";
import { createHmac } from "node:crypto";

import type { ImageProcessor } from "../application/image-processor";
import type { MediaStore } from "../application/media-store";
import { MediaStoreError } from "../domain/errors";
import type {
  BatchDeleteResult,
  MediaObjectMetadata,
  UploadAuthorization,
} from "../domain/types";
import { getServerApplicationUrl } from "@/platform/config/application-url";
import { getServerEnvironment } from "@/platform/config/env";

import { SharpImageProcessor } from "./sharp-image-processor";
import { TestFileMediaStore } from "./test-file-media-store";
import { FileMediaStore } from "./file-media-store";
import { VercelBlobMediaStore } from "./vercel-blob-media-store";

class UnavailableMediaStore implements MediaStore {
  private unavailable(): never {
    throw new MediaStoreError(
      "PROVIDER_UNAVAILABLE",
      "Private Blob media is not configured",
    );
  }

  async authorizePrivateUpload(): Promise<UploadAuthorization> {
    return this.unavailable();
  }
  async inspect(): Promise<MediaObjectMetadata | null> {
    return this.unavailable();
  }
  async read(): Promise<ReadableStream<Uint8Array>> {
    return this.unavailable();
  }
  async createTemporaryReadUrl(): Promise<URL> {
    return this.unavailable();
  }
  async putPrivate(): Promise<void> {
    return this.unavailable();
  }
  async delete(): Promise<void> {
    return this.unavailable();
  }
  async deleteMany(): Promise<BatchDeleteResult> {
    return this.unavailable();
  }
}

export function createConfiguredMediaStore(): MediaStore {
  const environment = getServerEnvironment();
  if (environment.APP_ENV === "test") {
    if (
      !environment.TEST_MEDIA_ROOT ||
      !environment.TEST_MEDIA_SIGNING_SECRET
    ) {
      throw new Error("The isolated Test media adapter is not configured");
    }
    return new TestFileMediaStore(
      environment.TEST_MEDIA_ROOT,
      environment.TEST_MEDIA_SIGNING_SECRET,
      getServerApplicationUrl(),
    );
  }
  if (!environment.BLOB_READ_WRITE_TOKEN) {
    if (
      environment.APP_ENV === "local" &&
      environment.AUTH_FINGERPRINT_SECRET
    ) {
      const signingSecret = createHmac(
        "sha256",
        environment.AUTH_FINGERPRINT_SECRET,
      )
        .update("local-private-media-v1")
        .digest("hex");
      return new FileMediaStore(
        ".local/media",
        signingSecret,
        getServerApplicationUrl(),
        "local",
      );
    }
    return new UnavailableMediaStore();
  }
  return new VercelBlobMediaStore(environment.BLOB_READ_WRITE_TOKEN);
}

export function createConfiguredLocalMediaStore(): FileMediaStore {
  if (getServerEnvironment().APP_ENV !== "local")
    throw new Error("Local uploads are disabled");
  const store = createConfiguredMediaStore();
  if (!(store instanceof FileMediaStore) || store.environment !== "local")
    throw new Error("Local file storage is not active");
  return store;
}

export function createConfiguredImageProcessor(): ImageProcessor {
  return new SharpImageProcessor();
}

export function createConfiguredTestMediaStore(): TestFileMediaStore {
  if (getServerEnvironment().APP_ENV !== "test") {
    throw new Error("The test media upload endpoint is disabled");
  }
  const store = createConfiguredMediaStore();
  if (!(store instanceof TestFileMediaStore)) {
    throw new Error("The test media adapter is unavailable");
  }
  return store;
}
