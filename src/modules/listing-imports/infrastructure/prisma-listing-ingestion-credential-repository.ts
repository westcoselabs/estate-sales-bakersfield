import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type {
  AuthenticateListingIngestionCredentialInput,
  AuthenticatedListingIngestionCredentialRecord,
  CreateListingIngestionCredentialRecordInput,
  CreateListingIngestionCredentialRecordResult,
  ListingIngestionCredentialRepository,
  RevokeListingIngestionCredentialRecordInput,
  RevokeListingIngestionCredentialRecordResult,
} from "../application/credential-ports";

const MAX_TRANSACTION_ATTEMPTS = 4;

type Transaction = Prisma.TransactionClient;

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class PrismaListingIngestionCredentialRepository implements ListingIngestionCredentialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createAtomically(
    input: CreateListingIngestionCredentialRecordInput,
  ): Promise<CreateListingIngestionCredentialRecordResult> {
    try {
      return await this.serializable((transaction) =>
        this.create(transaction, input),
      );
    } catch (error) {
      if (isUniqueConflict(error)) {
        return { status: "TOKEN_DIGEST_CONFLICT" };
      }
      throw error;
    }
  }

  async revokeAtomically(
    input: RevokeListingIngestionCredentialRecordInput,
  ): Promise<RevokeListingIngestionCredentialRecordResult> {
    return this.serializable((transaction) => this.revoke(transaction, input));
  }

  async authenticateActive(
    input: AuthenticateListingIngestionCredentialInput,
  ): Promise<AuthenticatedListingIngestionCredentialRecord | null> {
    return this.serializable((transaction) =>
      this.authenticate(transaction, input),
    );
  }

  private async serializable<T>(
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt < MAX_TRANSACTION_ATTEMPTS &&
          isSerializationConflict(error)
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("The ingestion credential transaction did not complete.");
  }

  private async create(
    transaction: Transaction,
    input: CreateListingIngestionCredentialRecordInput,
  ): Promise<CreateListingIngestionCredentialRecordResult> {
    const source = await transaction.listingImportSource.findUnique({
      where: { key: input.sourceKey },
      select: {
        id: true,
        key: true,
        enabled: true,
        productionAllowed: true,
      },
    });
    if (!source) return { status: "SOURCE_NOT_FOUND" };
    if (!source.enabled) return { status: "SOURCE_DISABLED" };
    if (input.requireProductionAllowed && !source.productionAllowed) {
      return { status: "SOURCE_NOT_PRODUCTION_ALLOWED" };
    }

    const credential = await transaction.listingIngestionCredential.create({
      data: {
        sourceId: source.id,
        name: input.name,
        tokenDigest: input.tokenDigest,
        displayPrefix: input.displayPrefix,
        createdByUserId: input.createdByUserId,
        createdAt: input.createdAt,
      },
      select: {
        id: true,
        name: true,
        displayPrefix: true,
        createdAt: true,
      },
    });
    await transaction.auditEntry.create({
      data: {
        actorUserId: input.createdByUserId,
        action: "LISTING_INGESTION_CREDENTIAL_CREATED",
        targetType: "LISTING_INGESTION_CREDENTIAL",
        targetId: credential.id,
        ...(input.requestId ? { requestId: input.requestId } : {}),
        metadata: {
          credentialId: credential.id,
          sourceId: source.id,
        },
      },
    });
    return {
      status: "CREATED",
      credentialId: credential.id,
      sourceId: source.id,
      sourceKey: source.key,
      name: credential.name,
      displayPrefix: credential.displayPrefix,
      createdAt: credential.createdAt,
    };
  }

  private async revoke(
    transaction: Transaction,
    input: RevokeListingIngestionCredentialRecordInput,
  ): Promise<RevokeListingIngestionCredentialRecordResult> {
    const existing = await transaction.listingIngestionCredential.findUnique({
      where: { id: input.credentialId },
      select: { id: true, sourceId: true, revokedAt: true },
    });
    if (!existing) return { status: "NOT_FOUND" };
    if (existing.revokedAt) {
      return {
        status: "REVOKED",
        credentialId: existing.id,
        sourceId: existing.sourceId,
        revokedAt: existing.revokedAt,
        alreadyRevoked: true,
      };
    }

    const update = await transaction.listingIngestionCredential.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: input.revokedAt },
    });
    if (update.count === 0) {
      const revoked = await transaction.listingIngestionCredential.findUnique({
        where: { id: existing.id },
        select: { revokedAt: true },
      });
      if (!revoked?.revokedAt) {
        throw new Error("The ingestion credential revocation did not persist.");
      }
      return {
        status: "REVOKED",
        credentialId: existing.id,
        sourceId: existing.sourceId,
        revokedAt: revoked.revokedAt,
        alreadyRevoked: true,
      };
    }

    await transaction.auditEntry.create({
      data: {
        actorUserId: input.revokedByUserId,
        action: "LISTING_INGESTION_CREDENTIAL_REVOKED",
        targetType: "LISTING_INGESTION_CREDENTIAL",
        targetId: existing.id,
        ...(input.requestId ? { requestId: input.requestId } : {}),
        metadata: {
          credentialId: existing.id,
          sourceId: existing.sourceId,
        },
      },
    });
    return {
      status: "REVOKED",
      credentialId: existing.id,
      sourceId: existing.sourceId,
      revokedAt: input.revokedAt,
      alreadyRevoked: false,
    };
  }

  private async authenticate(
    transaction: Transaction,
    input: AuthenticateListingIngestionCredentialInput,
  ): Promise<AuthenticatedListingIngestionCredentialRecord | null> {
    const credential = await transaction.listingIngestionCredential.findUnique({
      where: { tokenDigest: input.tokenDigest },
      select: {
        id: true,
        revokedAt: true,
        source: {
          select: {
            id: true,
            key: true,
            allowedHosts: true,
            allowedQueryParameters: true,
            enabled: true,
            productionAllowed: true,
          },
        },
      },
    });
    if (
      !credential ||
      credential.revokedAt ||
      !credential.source.enabled ||
      (input.requireProductionAllowed && !credential.source.productionAllowed)
    ) {
      return null;
    }

    await transaction.$executeRaw(Prisma.sql`
      UPDATE "listing_ingestion_credentials"
      SET "last_used_at" = GREATEST(
        "created_at",
        COALESCE("last_used_at", "created_at"),
        ${input.authenticatedAt}
      )
      WHERE "id" = ${credential.id}::uuid
    `);
    return {
      credentialId: credential.id,
      source: credential.source,
    };
  }
}
