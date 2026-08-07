import type { ListingImportSourceConfiguration } from "./ports";

export interface ListingIngestionCredentialTokenProvider {
  generate(): string;
  hash(rawToken: string): string;
  displayPrefix(rawToken: string): string;
  isWellFormed(rawToken: string): boolean;
}

export interface CreateListingIngestionCredentialRecordInput {
  readonly sourceKey: string;
  readonly name: string;
  readonly tokenDigest: string;
  readonly displayPrefix: string;
  readonly createdByUserId: string;
  readonly actorSessionId: string;
  readonly authorizationAt: Date;
  readonly createdAt: Date;
  readonly requireProductionAllowed: boolean;
  readonly requestId?: string;
}

export type CreateListingIngestionCredentialRecordResult =
  | {
      readonly status: "CREATED";
      readonly credentialId: string;
      readonly sourceId: string;
      readonly sourceKey: string;
      readonly name: string;
      readonly displayPrefix: string;
      readonly createdAt: Date;
    }
  | { readonly status: "SOURCE_NOT_FOUND" }
  | { readonly status: "SOURCE_DISABLED" }
  | { readonly status: "SOURCE_NOT_PRODUCTION_ALLOWED" }
  | { readonly status: "ACTOR_NOT_AUTHORIZED" }
  | { readonly status: "TOKEN_DIGEST_CONFLICT" };

export interface RevokeListingIngestionCredentialRecordInput {
  readonly credentialId: string;
  readonly revokedByUserId: string;
  readonly actorSessionId: string;
  readonly authorizationAt: Date;
  readonly revokedAt: Date;
  readonly requestId?: string;
}

export type RevokeListingIngestionCredentialRecordResult =
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "ACTOR_NOT_AUTHORIZED" }
  | {
      readonly status: "REVOKED";
      readonly credentialId: string;
      readonly sourceId: string;
      readonly revokedAt: Date;
      readonly alreadyRevoked: boolean;
    };

export interface AuthenticateListingIngestionCredentialInput {
  readonly tokenDigest: string;
  readonly authenticatedAt: Date;
  readonly requireProductionAllowed: boolean;
}

export interface AuthenticatedListingIngestionCredentialRecord {
  readonly credentialId: string;
  readonly source: ListingImportSourceConfiguration;
}

export interface ListingIngestionCredentialRepository {
  createAtomically(
    input: CreateListingIngestionCredentialRecordInput,
  ): Promise<CreateListingIngestionCredentialRecordResult>;
  revokeAtomically(
    input: RevokeListingIngestionCredentialRecordInput,
  ): Promise<RevokeListingIngestionCredentialRecordResult>;
  authenticateActive(
    input: AuthenticateListingIngestionCredentialInput,
  ): Promise<AuthenticatedListingIngestionCredentialRecord | null>;
}
