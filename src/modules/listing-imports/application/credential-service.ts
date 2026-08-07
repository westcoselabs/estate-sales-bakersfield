import { ListingIngestionCredentialError } from "./credential-errors";
import type {
  ListingIngestionCredentialRepository,
  ListingIngestionCredentialTokenProvider,
} from "./credential-ports";
import type { ListingImportSourceConfiguration } from "./ports";

const SOURCE_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const MAX_TOKEN_GENERATION_ATTEMPTS = 3;

export interface CreateListingIngestionCredentialInput {
  readonly sourceKey: string;
  readonly name: string;
  readonly actorUserId: string;
  readonly actorSessionId: string;
  readonly requestId?: string;
}

export interface CreatedListingIngestionCredential {
  readonly credentialId: string;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly name: string;
  readonly displayPrefix: string;
  readonly rawToken: string;
  readonly createdAt: Date;
}

export interface RevokeListingIngestionCredentialInput {
  readonly credentialId: string;
  readonly actorUserId: string;
  readonly actorSessionId: string;
  readonly requestId?: string;
}

export interface RevokedListingIngestionCredential {
  readonly credentialId: string;
  readonly sourceId: string;
  readonly revokedAt: Date;
  readonly alreadyRevoked: boolean;
}

export interface AuthenticatedListingIngestionCredential {
  readonly credentialId: string;
  readonly source: ListingImportSourceConfiguration;
}

export interface ListingIngestionCredentialServiceOptions {
  readonly production: boolean;
  readonly now?: () => Date;
}

function normalizeSourceKey(sourceKey: string): string {
  const normalized = sourceKey.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 64 ||
    !SOURCE_KEY_PATTERN.test(normalized)
  ) {
    throw new ListingIngestionCredentialError(
      "INVALID_SOURCE_KEY",
      "The listing source key is invalid.",
    );
  }
  return normalized;
}

function normalizeCredentialName(name: string): string {
  const normalized = name.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new ListingIngestionCredentialError(
      "INVALID_CREDENTIAL_NAME",
      "The ingestion credential name is invalid.",
    );
  }
  return normalized;
}

export class ListingIngestionCredentialService {
  private readonly clock: () => Date;

  constructor(
    private readonly credentials: ListingIngestionCredentialRepository,
    private readonly tokens: ListingIngestionCredentialTokenProvider,
    private readonly options: ListingIngestionCredentialServiceOptions,
  ) {
    this.clock = options.now ?? (() => new Date());
  }

  async create(
    input: CreateListingIngestionCredentialInput,
  ): Promise<CreatedListingIngestionCredential> {
    const sourceKey = normalizeSourceKey(input.sourceKey);
    const name = normalizeCredentialName(input.name);

    for (
      let attempt = 1;
      attempt <= MAX_TOKEN_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      const rawToken = this.tokens.generate();
      if (!this.tokens.isWellFormed(rawToken)) {
        throw new ListingIngestionCredentialError(
          "TOKEN_GENERATION_FAILED",
          "A valid ingestion credential could not be generated.",
        );
      }
      const authorizationAt = this.clock();
      const result = await this.credentials.createAtomically({
        sourceKey,
        name,
        tokenDigest: this.tokens.hash(rawToken),
        displayPrefix: this.tokens.displayPrefix(rawToken),
        createdByUserId: input.actorUserId,
        actorSessionId: input.actorSessionId,
        authorizationAt,
        createdAt: authorizationAt,
        requireProductionAllowed: this.options.production,
        ...(input.requestId ? { requestId: input.requestId } : {}),
      });

      switch (result.status) {
        case "CREATED":
          return {
            credentialId: result.credentialId,
            sourceId: result.sourceId,
            sourceKey: result.sourceKey,
            name: result.name,
            displayPrefix: result.displayPrefix,
            rawToken,
            createdAt: result.createdAt,
          };
        case "TOKEN_DIGEST_CONFLICT":
          break;
        case "ACTOR_NOT_AUTHORIZED":
          throw new ListingIngestionCredentialError(
            "ACTOR_NOT_AUTHORIZED",
            "Recent administrator authorization is required.",
          );
        case "SOURCE_NOT_FOUND":
          throw new ListingIngestionCredentialError(
            "SOURCE_NOT_FOUND",
            "The listing source does not exist.",
          );
        case "SOURCE_DISABLED":
          throw new ListingIngestionCredentialError(
            "SOURCE_DISABLED",
            "The listing source is disabled.",
          );
        case "SOURCE_NOT_PRODUCTION_ALLOWED":
          throw new ListingIngestionCredentialError(
            "SOURCE_NOT_PRODUCTION_ALLOWED",
            "The listing source is unavailable in production.",
          );
      }
    }

    throw new ListingIngestionCredentialError(
      "TOKEN_GENERATION_FAILED",
      "A unique ingestion credential could not be generated.",
    );
  }

  async revoke(
    input: RevokeListingIngestionCredentialInput,
  ): Promise<RevokedListingIngestionCredential | null> {
    const authorizationAt = this.clock();
    const result = await this.credentials.revokeAtomically({
      credentialId: input.credentialId,
      revokedByUserId: input.actorUserId,
      actorSessionId: input.actorSessionId,
      authorizationAt,
      revokedAt: authorizationAt,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
    if (result.status === "ACTOR_NOT_AUTHORIZED") {
      throw new ListingIngestionCredentialError(
        "ACTOR_NOT_AUTHORIZED",
        "Recent administrator authorization is required.",
      );
    }
    return result.status === "NOT_FOUND" ? null : result;
  }

  async authenticate(
    rawToken: string | null | undefined,
  ): Promise<AuthenticatedListingIngestionCredential | null> {
    if (typeof rawToken !== "string" || !this.tokens.isWellFormed(rawToken)) {
      return null;
    }
    return this.credentials.authenticateActive({
      tokenDigest: this.tokens.hash(rawToken),
      authenticatedAt: this.clock(),
      requireProductionAllowed: this.options.production,
    });
  }
}
