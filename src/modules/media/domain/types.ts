declare const mediaObjectKeyBrand: unique symbol;

export type MediaObjectKey = string & { readonly [mediaObjectKeyBrand]: true };
export type MediaEnvironment = "local" | "test" | "preview" | "production";

export interface MediaScope {
  readonly environment: MediaEnvironment;
  readonly resourceScope: string;
  readonly reservationId: string;
  readonly randomName: string;
}

export interface UploadAuthorizationInput {
  readonly scope: MediaScope;
  readonly allowedContentTypes: readonly string[];
  readonly maximumSizeInBytes: number;
  readonly expiresAt: Date;
}

interface UploadAuthorizationBase {
  readonly objectKey: MediaObjectKey;
  readonly expiresAt: Date;
}

export interface VercelClientUploadAuthorization extends UploadAuthorizationBase {
  readonly transport: "vercel-client";
}

export interface TestDirectUploadAuthorization extends UploadAuthorizationBase {
  readonly transport: "test-direct";
  readonly uploadUrl: URL;
  readonly method: "PUT";
  readonly headers: Readonly<Record<string, string>>;
}

export type UploadAuthorization =
  VercelClientUploadAuthorization | TestDirectUploadAuthorization;

export interface MediaObjectMetadata {
  readonly objectKey: MediaObjectKey;
  readonly size: number;
  readonly contentType: string;
  readonly etag: string;
  readonly uploadedAt: Date;
}

export interface BatchDeleteResult {
  readonly requested: number;
  readonly deleted: number;
}
