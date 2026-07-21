import type {
  BatchDeleteResult,
  MediaObjectKey,
  MediaObjectMetadata,
  UploadAuthorization,
  UploadAuthorizationInput,
} from "../domain/types";

export interface MediaStore {
  authorizePrivateUpload(
    input: UploadAuthorizationInput,
  ): Promise<UploadAuthorization>;
  inspect(key: MediaObjectKey): Promise<MediaObjectMetadata | null>;
  read(key: MediaObjectKey): Promise<ReadableStream<Uint8Array>>;
  createTemporaryReadUrl(key: MediaObjectKey, ttlSeconds: number): Promise<URL>;
  putPrivate(
    key: MediaObjectKey,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  delete(key: MediaObjectKey): Promise<void>;
  deleteMany(keys: readonly MediaObjectKey[]): Promise<BatchDeleteResult>;
}
