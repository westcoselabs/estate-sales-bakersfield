import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import {
  batchAuditMetadata,
  candidateAuditMetadata,
} from "../application/audit";
import type {
  ListingImportJsonValue,
  ListingImportPersistenceResult,
  ListingImportRepository,
  ListingImportTransactionInput,
  PreparedListingImportRow,
} from "../application/ports";
import {
  ListingImportConflictError,
  ListingImportError,
} from "../domain/errors";
import { probableDuplicateReasons } from "../domain/duplicates";
import { normalizeComparableText } from "../domain/normalization";
import type {
  ListingImportBatchStatus,
  ListingImportCounts,
  ListingDuplicateComparable,
  ListingImportRowResult,
  ListingImportRowStatus,
  ListingImportValidationCode,
  ListingProbableDuplicateReason,
  NormalizedListingImportItem,
} from "../domain/types";

const MAX_TRANSACTION_ATTEMPTS = 4;
const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

interface DuplicateTargetRow {
  readonly id: string;
  readonly title: string | null;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly normalized_address: string | null;
  readonly postal_code: string | null;
  readonly latitude: Prisma.Decimal | null;
  readonly longitude: Prisma.Decimal | null;
  readonly confirmation_status: string | null;
}

interface StagedRow {
  readonly prepared: PreparedListingImportRow;
  readonly status: ListingImportRowStatus;
  readonly sourceRecordId: string | null;
  readonly candidateId: string | null;
}

type Transaction = Prisma.TransactionClient;

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

function jsonWriteValue(
  value: ListingImportJsonValue,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function jsonDocument(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function validationCodes(
  value: Prisma.JsonValue,
): ListingImportValidationCode[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ListingImportValidationCode => typeof entry === "string",
  );
}

function countStatuses(rows: readonly StagedRow[]): ListingImportCounts {
  const counts = {
    total: rows.length,
    candidateCreated: 0,
    invalid: 0,
    exactDuplicate: 0,
    sourceChanged: 0,
    identityConflict: 0,
  };
  for (const row of rows) {
    switch (row.status) {
      case "CANDIDATE_CREATED":
        counts.candidateCreated += 1;
        break;
      case "INVALID":
        counts.invalid += 1;
        break;
      case "EXACT_DUPLICATE":
        counts.exactDuplicate += 1;
        break;
      case "SOURCE_CHANGED":
        counts.sourceChanged += 1;
        break;
      case "IDENTITY_CONFLICT":
        counts.identityConflict += 1;
        break;
    }
  }
  return counts;
}

function batchStatus(counts: ListingImportCounts): ListingImportBatchStatus {
  const rejected = counts.invalid + counts.identityConflict;
  if (rejected === 0) return "COMPLETED";
  return rejected === counts.total ? "REJECTED" : "PARTIAL";
}

function comparableTarget(row: DuplicateTargetRow): ListingDuplicateComparable {
  const confirmed =
    row.confirmation_status === "CONFIRMED" &&
    row.latitude !== null &&
    row.longitude !== null;
  return {
    normalizedTitle: normalizeComparableText(row.title ?? ""),
    normalizedAddress: normalizeComparableText(row.normalized_address ?? ""),
    normalizedPostalCode: normalizeComparableText(row.postal_code ?? ""),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    confirmedPoint: confirmed
      ? {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        }
      : null,
  };
}

function comparableCandidate(
  item: NormalizedListingImportItem,
): ListingDuplicateComparable {
  return {
    normalizedTitle: item.normalizedTitle,
    normalizedAddress: item.normalizedAddress,
    normalizedPostalCode: item.normalizedPostalCode,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    confirmedPoint: null,
  };
}

async function findDuplicateTargets(
  transaction: Transaction,
  item: NormalizedListingImportItem,
): Promise<
  readonly {
    targetKind: "EVENT" | "EXTERNAL_LISTING";
    targetId: string;
    reasons: readonly ListingProbableDuplicateReason[];
  }[]
> {
  const lowerStart = new Date(item.startsAt.getTime() - ONE_DAY_MILLISECONDS);
  const upperStart = new Date(item.startsAt.getTime() + ONE_DAY_MILLISECONDS);
  const events = await transaction.$queryRaw<DuplicateTargetRow[]>(Prisma.sql`
    SELECT
      e."id", e."title", e."starts_at", e."ends_at",
      l."normalized_address", l."postal_code", l."latitude", l."longitude",
      l."confirmation_status"::text AS "confirmation_status"
    FROM "events" e
    LEFT JOIN "event_locations" l ON l."event_id" = e."id"
    WHERE e."title" IS NOT NULL
      AND e."starts_at" IS NOT NULL
      AND e."ends_at" IS NOT NULL
      AND e."deleted_at" IS NULL
      AND e."canceled_at" IS NULL
      AND e."removed_at" IS NULL
      AND (
        (e."starts_at" < ${item.endsAt} AND ${item.startsAt} < e."ends_at")
        OR e."starts_at" BETWEEN ${lowerStart} AND ${upperStart}
      )
  `);
  const externalListings = await transaction.$queryRaw<DuplicateTargetRow[]>(
    Prisma.sql`
      SELECT
        e."id", e."title", e."starts_at", e."ends_at",
        l."normalized_address", l."postal_code", l."latitude", l."longitude",
        l."confirmation_status"::text AS "confirmation_status"
      FROM "external_listings" e
      LEFT JOIN "external_listing_locations" l ON l."listing_id" = e."id"
      WHERE e."status" <> 'REMOVED'::"external_listing_status"
        AND (
          (e."starts_at" < ${item.endsAt} AND ${item.startsAt} < e."ends_at")
          OR e."starts_at" BETWEEN ${lowerStart} AND ${upperStart}
        )
    `,
  );
  const candidate = comparableCandidate(item);
  return [
    ...events.map((target) => ({
      targetKind: "EVENT" as const,
      targetId: target.id,
      reasons: probableDuplicateReasons(candidate, comparableTarget(target)),
    })),
    ...externalListings.map((target) => ({
      targetKind: "EXTERNAL_LISTING" as const,
      targetId: target.id,
      reasons: probableDuplicateReasons(candidate, comparableTarget(target)),
    })),
  ].filter((target) => target.reasons.length > 0);
}

async function replayResult(
  transaction: Transaction,
  batchId: string,
): Promise<ListingImportPersistenceResult> {
  const batch = await transaction.listingImportBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      rows: {
        orderBy: { rowNumber: "asc" },
        include: {
          sourceRecord: {
            select: {
              candidate: { select: { id: true, latestObservationId: true } },
            },
          },
        },
      },
    },
  });
  return {
    batchId: batch.id,
    replayed: true,
    status: batch.status,
    counts: {
      total: batch.totalRows,
      candidateCreated: batch.candidateRows,
      invalid: batch.invalidRows,
      exactDuplicate: batch.exactDuplicateRows,
      sourceChanged: batch.sourceChangedRows,
      identityConflict: batch.identityConflictRows,
    },
    rows: batch.rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      candidateId:
        row.status === "CANDIDATE_CREATED" &&
        row.sourceRecord?.candidate?.latestObservationId === row.id
          ? row.sourceRecord.candidate.id
          : null,
      validationCodes: validationCodes(row.validationFailures),
    })),
  };
}

async function assertActor(
  transaction: Transaction,
  input: ListingImportTransactionInput,
): Promise<void> {
  if (input.actor.kind === "API_CREDENTIAL") {
    const credential = await transaction.listingIngestionCredential.findFirst({
      where: {
        id: input.actor.credentialId,
        sourceId: input.sourceId,
        revokedAt: null,
        source: { enabled: true },
      },
      select: { id: true },
    });
    if (!credential) {
      throw new ListingImportError(
        "ACTOR_TRANSPORT_MISMATCH",
        "The ingestion credential is not authorized for this source.",
      );
    }
    return;
  }
  const administrator = await transaction.user.findUnique({
    where: {
      id: input.actor.adminUserId,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: { not: null },
    },
    select: { id: true },
  });
  if (!administrator) {
    throw new ListingImportError(
      "ACTOR_TRANSPORT_MISMATCH",
      "The import actor is unavailable.",
    );
  }
}

async function findReplayOrConflict(
  transaction: Transaction,
  input: ListingImportTransactionInput,
): Promise<ListingImportPersistenceResult | null> {
  if (input.actor.kind === "API_CREDENTIAL") {
    const idempotent = await transaction.listingImportBatch.findFirst({
      where: {
        credentialId: input.actor.credentialId,
        idempotencyKeyDigest: input.actor.idempotencyKeyDigest,
      },
      select: { id: true, requestDigest: true },
    });
    if (idempotent) {
      if (idempotent.requestDigest !== input.requestDigest) {
        throw new ListingImportConflictError(
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used for different content.",
        );
      }
      await transaction.listingIngestionCredential.update({
        where: { id: input.actor.credentialId },
        data: { lastUsedAt: new Date() },
      });
      return replayResult(transaction, idempotent.id);
    }
  }

  const run = await transaction.listingImportBatch.findFirst({
    where: {
      sourceId: input.sourceId,
      ingestorInstanceId: input.ingestorInstanceId,
      ingestorRunId: input.ingestorRunId,
    },
    select: { id: true, payloadDigest: true },
  });
  if (!run) return null;
  if (run.payloadDigest !== input.payloadDigest) {
    throw new ListingImportConflictError(
      "RUN_IDENTITY_CONFLICT",
      "The ingestor run identity was already used for different content.",
    );
  }
  if (input.actor.kind === "API_CREDENTIAL") {
    await transaction.listingIngestionCredential.update({
      where: { id: input.actor.credentialId },
      data: { lastUsedAt: new Date() },
    });
  }
  return replayResult(transaction, run.id);
}

async function stageRows(
  transaction: Transaction,
  input: ListingImportTransactionInput,
): Promise<readonly StagedRow[]> {
  const staged: StagedRow[] = [];
  for (const prepared of input.rows) {
    if (prepared.status === "INVALID") {
      staged.push({
        prepared,
        status: "INVALID",
        sourceRecordId: null,
        candidateId: null,
      });
      continue;
    }

    const { item } = prepared;
    const [byIdentity, byUrl] = await Promise.all([
      transaction.listingSourceRecord.findUnique({
        where: {
          sourceId_sourceListingId: {
            sourceId: input.sourceId,
            sourceListingId: item.sourceListingId,
          },
        },
        select: {
          id: true,
          canonicalSourceUrl: true,
          lastContentHash: true,
          lastSeenAt: true,
        },
      }),
      transaction.listingSourceRecord.findUnique({
        where: {
          sourceId_canonicalSourceUrl: {
            sourceId: input.sourceId,
            canonicalSourceUrl: item.canonicalSourceUrl,
          },
        },
        select: {
          id: true,
          sourceListingId: true,
          lastContentHash: true,
          lastSeenAt: true,
        },
      }),
    ]);

    if (byUrl && (!byIdentity || byUrl.id !== byIdentity.id)) {
      staged.push({
        prepared,
        status: "IDENTITY_CONFLICT",
        sourceRecordId: null,
        candidateId: null,
      });
      continue;
    }

    if (byIdentity) {
      const status: ListingImportRowStatus =
        byIdentity.lastContentHash === item.contentHash
          ? "EXACT_DUPLICATE"
          : "SOURCE_CHANGED";
      const isNewest = item.retrievedAt >= byIdentity.lastSeenAt;
      await transaction.listingSourceRecord.update({
        where: { id: byIdentity.id },
        data: {
          lastSeenAt:
            item.retrievedAt > byIdentity.lastSeenAt
              ? item.retrievedAt
              : byIdentity.lastSeenAt,
          ...(isNewest
            ? {
                canonicalSourceUrl: item.canonicalSourceUrl,
                lastContentHash: item.contentHash,
              }
            : {}),
        },
      });
      staged.push({
        prepared,
        status,
        sourceRecordId: byIdentity.id,
        candidateId: null,
      });
      continue;
    }

    const sourceRecord = await transaction.listingSourceRecord.create({
      data: {
        sourceId: input.sourceId,
        sourceListingId: item.sourceListingId,
        canonicalSourceUrl: item.canonicalSourceUrl,
        firstSeenAt: item.retrievedAt,
        lastSeenAt: item.retrievedAt,
        lastContentHash: item.contentHash,
      },
      select: { id: true },
    });
    staged.push({
      prepared,
      status: "CANDIDATE_CREATED",
      sourceRecordId: sourceRecord.id,
      candidateId: randomUUID(),
    });
  }
  return staged;
}

export class PrismaListingImportRepository implements ListingImportRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async findSourceByKey(sourceKey: string) {
    const source = await this.prisma.listingImportSource.findUnique({
      where: { key: sourceKey },
      select: {
        id: true,
        key: true,
        allowedHosts: true,
        allowedQueryParameters: true,
        enabled: true,
        productionAllowed: true,
      },
    });
    return source
      ? {
          ...source,
          allowedHosts: [...source.allowedHosts],
          allowedQueryParameters: [...source.allowedQueryParameters],
        }
      : null;
  }

  async processBatchAtomically(
    input: ListingImportTransactionInput,
  ): Promise<ListingImportPersistenceResult> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => this.process(transaction, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          attempt < MAX_TRANSACTION_ATTEMPTS &&
          isRetryableTransactionError(error)
        ) {
          continue;
        }
        if (isRetryableTransactionError(error)) {
          throw new ListingImportConflictError(
            "IMPORT_CONFLICT",
            "The import could not be serialized safely.",
            { cause: error },
          );
        }
        throw error;
      }
    }
    throw new ListingImportConflictError();
  }

  private async process(
    transaction: Transaction,
    input: ListingImportTransactionInput,
  ): Promise<ListingImportPersistenceResult> {
    const source = await transaction.listingImportSource.findFirst({
      where: { id: input.sourceId, key: input.sourceKey, enabled: true },
      select: { id: true },
    });
    if (!source) {
      throw new ListingImportError(
        "SOURCE_DISABLED",
        "The listing source is unavailable.",
      );
    }
    await assertActor(transaction, input);
    const replay = await findReplayOrConflict(transaction, input);
    if (replay) return replay;

    const now = this.clock();
    const staged = await stageRows(transaction, input);
    const counts = countStatuses(staged);
    const status = batchStatus(counts);
    const batchId = randomUUID();
    await transaction.listingImportBatch.create({
      data: {
        id: batchId,
        sourceId: input.sourceId,
        transport: input.transport,
        contractVersion: input.contractVersion,
        parserVersion: input.parserVersion,
        ingestorRunId: input.ingestorRunId,
        ingestorInstanceId: input.ingestorInstanceId,
        requestDigest: input.requestDigest,
        payloadDigest: input.payloadDigest,
        status,
        totalRows: counts.total,
        candidateRows: counts.candidateCreated,
        invalidRows: counts.invalid,
        exactDuplicateRows: counts.exactDuplicate,
        sourceChangedRows: counts.sourceChanged,
        identityConflictRows: counts.identityConflict,
        createdAt: now,
        completedAt: now,
        ...(input.actor.kind === "API_CREDENTIAL"
          ? {
              credentialId: input.actor.credentialId,
              idempotencyKeyDigest: input.actor.idempotencyKeyDigest,
            }
          : { adminActorUserId: input.actor.adminUserId }),
      },
    });

    const results: ListingImportRowResult[] = [];
    for (const stagedRow of staged) {
      const rowId = randomUUID();
      const prepared = stagedRow.prepared;
      await transaction.listingImportRow.create({
        data: {
          id: rowId,
          batchId,
          rowNumber: prepared.rowNumber,
          sourceRecordId: stagedRow.sourceRecordId,
          status: stagedRow.status,
          inputJson: jsonWriteValue(prepared.inputJson),
          normalizedJson:
            prepared.status === "VALID"
              ? jsonWriteValue(prepared.normalizedJson)
              : Prisma.DbNull,
          validationFailures:
            prepared.status === "INVALID" ? [...prepared.validationCodes] : [],
          contentHash:
            prepared.status === "VALID" ? prepared.item.contentHash : null,
        },
      });

      if (
        stagedRow.status === "CANDIDATE_CREATED" &&
        stagedRow.candidateId &&
        stagedRow.sourceRecordId &&
        prepared.status === "VALID"
      ) {
        const item = prepared.item;
        await transaction.listingImportCandidate.create({
          data: {
            id: stagedRow.candidateId,
            sourceRecordId: stagedRow.sourceRecordId,
            latestObservationId: rowId,
            currentPayload: jsonWriteValue(prepared.normalizedJson),
            normalizedTitle: item.normalizedTitle,
            normalizedAddress: item.normalizedAddress || null,
            normalizedCity: item.normalizedCity,
            normalizedPostalCode: item.normalizedPostalCode || null,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
          },
        });
        const duplicates = await findDuplicateTargets(transaction, item);
        if (duplicates.length > 0) {
          await transaction.listingDuplicateMatch.createMany({
            data: duplicates.map((duplicate) => ({
              candidateId: stagedRow.candidateId as string,
              ...(duplicate.targetKind === "EVENT"
                ? { eventId: duplicate.targetId }
                : { externalListingId: duplicate.targetId }),
              reasons: [...duplicate.reasons],
            })),
          });
        }
        await transaction.auditEntry.create({
          data: {
            actorUserId:
              input.actor.kind === "ADMIN_USER"
                ? input.actor.adminUserId
                : null,
            action: "LISTING_IMPORT_CANDIDATE_CREATED",
            targetType: "LISTING_IMPORT_CANDIDATE",
            targetId: stagedRow.candidateId,
            ...(input.audit.requestId
              ? { requestId: input.audit.requestId }
              : {}),
            metadata: jsonDocument(
              candidateAuditMetadata({
                batchId,
                candidateId: stagedRow.candidateId,
                sourceRecordId: stagedRow.sourceRecordId,
                contentHash: item.contentHash,
              }),
            ),
          },
        });
      }

      results.push({
        rowNumber: prepared.rowNumber,
        status: stagedRow.status,
        candidateId:
          stagedRow.status === "CANDIDATE_CREATED"
            ? stagedRow.candidateId
            : null,
        validationCodes:
          prepared.status === "INVALID" ? prepared.validationCodes : [],
      });
    }

    if (input.actor.kind === "API_CREDENTIAL") {
      await transaction.listingIngestionCredential.update({
        where: { id: input.actor.credentialId },
        data: { lastUsedAt: now },
      });
    }
    const allValidationCodes = staged.flatMap((row) =>
      row.prepared.status === "INVALID"
        ? [...row.prepared.validationCodes]
        : [],
    );
    await transaction.auditEntry.create({
      data: {
        actorUserId:
          input.actor.kind === "ADMIN_USER" ? input.actor.adminUserId : null,
        action: "LISTING_IMPORT_BATCH_CREATED",
        targetType: "LISTING_IMPORT_BATCH",
        targetId: batchId,
        ...(input.audit.requestId ? { requestId: input.audit.requestId } : {}),
        metadata: jsonDocument(
          batchAuditMetadata({
            batchId,
            sourceId: input.sourceId,
            requestDigest: input.requestDigest,
            payloadDigest: input.payloadDigest,
            counts,
            validationCodes: allValidationCodes,
          }),
        ),
      },
    });

    return {
      batchId,
      replayed: false,
      status,
      counts,
      rows: results,
    };
  }
}
