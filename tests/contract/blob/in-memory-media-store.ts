import type { MediaStore } from "@/modules/media/application/media-store";
import { MediaStoreError } from "@/modules/media/domain/errors";
import { createMediaObjectKey } from "@/modules/media/domain/object-key";
import type {
  BatchDeleteResult,
  MediaObjectKey,
  MediaObjectMetadata,
  UploadAuthorization,
  UploadAuthorizationInput,
} from "@/modules/media/domain/types";

interface StoredFixture {
  readonly bytes: Uint8Array;
  readonly metadata: MediaObjectMetadata;
}

export class InMemoryMediaStore implements MediaStore {
  private readonly objects = new Map<MediaObjectKey, StoredFixture>();

  async authorizePrivateUpload(
    input: UploadAuthorizationInput,
  ): Promise<UploadAuthorization> {
    const objectKey = createMediaObjectKey(input.scope);
    return {
      transport: "test-direct",
      objectKey,
      uploadUrl: new URL(`https://upload.example.test/${objectKey}`),
      method: "PUT",
      headers: {},
      expiresAt: input.expiresAt,
    };
  }

  async inspect(key: MediaObjectKey): Promise<MediaObjectMetadata | null> {
    return this.objects.get(key)?.metadata ?? null;
  }

  async read(key: MediaObjectKey): Promise<ReadableStream<Uint8Array>> {
    const object = this.objects.get(key);
    if (!object)
      throw new MediaStoreError("NOT_FOUND", "Fixture object not found");
    const bytes = object.bytes;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  async createTemporaryReadUrl(
    key: MediaObjectKey,
    ttlSeconds: number,
  ): Promise<URL> {
    if (!this.objects.has(key)) {
      throw new MediaStoreError("NOT_FOUND", "Fixture object not found");
    }
    return new URL(
      `https://read.example.test/${key}?ttl=${String(ttlSeconds)}`,
    );
  }

  async putPrivate(
    key: MediaObjectKey,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    if (this.objects.has(key)) {
      throw new MediaStoreError("PROVIDER_ERROR", "Object already exists");
    }
    this.putFixture(key, bytes, contentType);
  }

  async delete(key: MediaObjectKey): Promise<void> {
    this.objects.delete(key);
  }

  async deleteMany(
    keys: readonly MediaObjectKey[],
  ): Promise<BatchDeleteResult> {
    let deleted = 0;
    for (const key of keys) {
      if (this.objects.delete(key)) deleted += 1;
    }
    return { requested: keys.length, deleted };
  }

  putFixture(
    key: MediaObjectKey,
    bytes: Uint8Array,
    contentType = "image/jpeg",
  ): void {
    this.objects.set(key, {
      bytes,
      metadata: {
        objectKey: key,
        size: bytes.byteLength,
        contentType,
        etag: `fixture-${String(bytes.byteLength)}`,
        uploadedAt: new Date("2026-07-16T12:00:00.000Z"),
      },
    });
  }
}
