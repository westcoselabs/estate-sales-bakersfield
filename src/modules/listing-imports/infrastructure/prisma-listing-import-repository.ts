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
import type {
  ListingImportBatchStatus,
  ListingImportCounts,
  ListingImportRowResult,
  ListingImportRowStatus,
  ListingImportValidationCode,
  NormalizedListingImportItem,
} from "../domain/types";
import { findPrismaDuplicateTargets } from "./prisma-duplicate-matcher";

const MAX_TRANSACTION_ATTEMPTS = 4;
const TRANSACTION_TIMEOUT_MILLISECONDS = 15_000;

interface StagedRow {
  readonly rowId: string;
  readonly prepared: PreparedListingImportRow;
  readonly status: ListingImportRowStatus;
  readonly sourceRecordId: string | null;
  readonly candidateId: string | null;
}

interface SourceRecordState {
  readonly id: string;
  readonly sourceListingId: string;
  canonicalSourceUrl: string;
  readonly firstSeenAt: Date;
  lastSeenAt: Date;
  lastContentHash: string;
  readonly isNew: boolean;
  dirty: boolean;
}

interface CandidateToCreate {
  readonly candidateId: string;
  readonly rowId: string;
  readonly sourceRecordId: string;
  readonly item: NormalizedListingImportItem;
  readonly normalizedJson: Readonly<Record<string, ListingImportJsonValue>>;
}

type Transaction = Prisma.TransactionClient;

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

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

async function replayResult(
  transaction: Transaction,
  batchId: string,
): Promise<ListingImportPersistenceResult> {
  const batch = await transaction.listingImportBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: {
      rows: {
        orderBy: { rowNumber: "asc" },
        include: { createdCandidate: { select: { id: true } } },
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
        row.status === "CANDIDATE_CREATED"
          ? (row.createdCandidate?.id ?? null)
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
    const idempotent = await transaction.listingImportIdempotencyKey.findUnique(
      {
        where: {
          credentialId_idempotencyKeyDigest: {
            credentialId: input.actor.credentialId,
            idempotencyKeyDigest: input.actor.idempotencyKeyDigest,
          },
        },
        select: { batchId: true, requestDigest: true },
      },
    );
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
      return replayResult(transaction, idempotent.batchId);
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
    await transaction.listingImportIdempotencyKey.create({
      data: {
        credentialId: input.actor.credentialId,
        idempotencyKeyDigest: input.actor.idempotencyKeyDigest,
        requestDigest: input.requestDigest,
        batchId: run.id,
      },
    });
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
  const validRows = input.rows.filter(
    (
      row,
    ): row is Extract<PreparedListingImportRow, { readonly status: "VALID" }> =>
      row.status === "VALID",
  );
  const existing =
    validRows.length === 0
      ? []
      : await transaction.listingSourceRecord.findMany({
          where: {
            sourceId: input.sourceId,
            OR: [
              {
                sourceListingId: {
                  in: [
                    ...new Set(
                      validRows.map((row) => row.item.sourceListingId),
                    ),
                  ],
                },
              },
              {
                canonicalSourceUrl: {
                  in: [
                    ...new Set(
                      validRows.map((row) => row.item.canonicalSourceUrl),
                    ),
                  ],
                },
              },
            ],
          },
          select: {
            id: true,
            sourceListingId: true,
            canonicalSourceUrl: true,
            firstSeenAt: true,
            lastSeenAt: true,
            lastContentHash: true,
          },
        });
  const stateById = new Map<string, SourceRecordState>();
  const byIdentity = new Map<string, SourceRecordState>();
  const byUrl = new Map<string, SourceRecordState>();
  for (const record of existing) {
    const state: SourceRecordState = {
      ...record,
      isNew: false,
      dirty: false,
    };
    stateById.set(state.id, state);
    byIdentity.set(state.sourceListingId, state);
    byUrl.set(state.canonicalSourceUrl, state);
  }

  const staged: StagedRow[] = [];
  for (const prepared of input.rows) {
    const rowId = randomUUID();
    if (prepared.status === "INVALID") {
      staged.push({
        rowId,
        prepared,
        status: "INVALID",
        sourceRecordId: null,
        candidateId: null,
      });
      continue;
    }

    const { item } = prepared;
    const identityRecord = byIdentity.get(item.sourceListingId);
    const urlRecord = byUrl.get(item.canonicalSourceUrl);

    if (urlRecord && (!identityRecord || urlRecord.id !== identityRecord.id)) {
      staged.push({
        rowId,
        prepared,
        status: "IDENTITY_CONFLICT",
        sourceRecordId: null,
        candidateId: null,
      });
      continue;
    }

    if (identityRecord) {
      const status: ListingImportRowStatus =
        identityRecord.lastContentHash === item.contentHash
          ? "EXACT_DUPLICATE"
          : "SOURCE_CHANGED";
      const isNewest = item.retrievedAt >= identityRecord.lastSeenAt;
      if (item.retrievedAt > identityRecord.lastSeenAt) {
        identityRecord.lastSeenAt = item.retrievedAt;
        identityRecord.dirty = true;
      }
      if (isNewest) {
        if (identityRecord.canonicalSourceUrl !== item.canonicalSourceUrl) {
          if (
            byUrl.get(identityRecord.canonicalSourceUrl)?.id ===
            identityRecord.id
          ) {
            byUrl.delete(identityRecord.canonicalSourceUrl);
          }
          identityRecord.canonicalSourceUrl = item.canonicalSourceUrl;
          byUrl.set(item.canonicalSourceUrl, identityRecord);
          identityRecord.dirty = true;
        }
        if (identityRecord.lastContentHash !== item.contentHash) {
          identityRecord.lastContentHash = item.contentHash;
          identityRecord.dirty = true;
        }
      }
      staged.push({
        rowId,
        prepared,
        status,
        sourceRecordId: identityRecord.id,
        candidateId: null,
      });
      continue;
    }

    const sourceRecord: SourceRecordState = {
      id: randomUUID(),
      sourceListingId: item.sourceListingId,
      canonicalSourceUrl: item.canonicalSourceUrl,
      firstSeenAt: item.retrievedAt,
      lastSeenAt: item.retrievedAt,
      lastContentHash: item.contentHash,
      isNew: true,
      dirty: false,
    };
    stateById.set(sourceRecord.id, sourceRecord);
    byIdentity.set(sourceRecord.sourceListingId, sourceRecord);
    byUrl.set(sourceRecord.canonicalSourceUrl, sourceRecord);
    staged.push({
      rowId,
      prepared,
      status: "CANDIDATE_CREATED",
      sourceRecordId: sourceRecord.id,
      candidateId: randomUUID(),
    });
  }

  const updatedRecords = [...stateById.values()].filter(
    (record) => !record.isNew && record.dirty,
  );
  if (updatedRecords.length > 0) {
    const updatesJson = JSON.stringify(
      updatedRecords.map((record) => ({
        id: record.id,
        canonical_source_url: record.canonicalSourceUrl,
        last_seen_at: record.lastSeenAt.toISOString(),
        last_content_hash: record.lastContentHash,
      })),
    );
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "listing_source_records" AS target
      SET
        "canonical_source_url" = updates.canonical_source_url,
        "last_seen_at" = updates.last_seen_at,
        "last_content_hash" = updates.last_content_hash,
        "updated_at" = CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(${updatesJson}::jsonb) AS updates(
        id uuid,
        canonical_source_url varchar,
        last_seen_at timestamptz,
        last_content_hash char(64)
      )
      WHERE target."id" = updates.id
    `);
  }
  // Apply URL moves before inserting new identities. A later row in this same
  // batch may legitimately claim a canonical URL released by an earlier row;
  // inserting first would hit the old database value's unique constraint.
  const newRecords = [...stateById.values()].filter((record) => record.isNew);
  if (newRecords.length > 0) {
    await transaction.listingSourceRecord.createMany({
      data: newRecords.map((record) => ({
        id: record.id,
        sourceId: input.sourceId,
        sourceListingId: record.sourceListingId,
        canonicalSourceUrl: record.canonicalSourceUrl,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        lastContentHash: record.lastContentHash,
      })),
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
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: TRANSACTION_TIMEOUT_MILLISECONDS,
          },
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
    const sources = await transaction.$queryRaw<
      {
        id: string;
        allowed_hosts: string[];
        allowed_query_parameters: string[];
        production_allowed: boolean;
      }[]
    >(Prisma.sql`
      SELECT
        "id",
        "allowed_hosts",
        "allowed_query_parameters",
        "production_allowed"
      FROM "listing_import_sources"
      WHERE "id" = ${input.sourceId}::uuid
        AND "key" = ${input.sourceKey}
        AND "enabled" = TRUE
      FOR SHARE
    `);
    const source = sources[0];
    if (
      !source ||
      (input.requireProductionAllowed && !source.production_allowed) ||
      !sameStrings(source.allowed_hosts, input.sourcePolicy.allowedHosts) ||
      !sameStrings(
        source.allowed_query_parameters,
        input.sourcePolicy.allowedQueryParameters,
      )
    ) {
      throw new ListingImportError(
        input.requireProductionAllowed && source && !source.production_allowed
          ? "SOURCE_NOT_PRODUCTION_ALLOWED"
          : "SOURCE_DISABLED",
        "The listing source or its URL policy changed before persistence.",
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
          ? { credentialId: input.actor.credentialId }
          : { adminActorUserId: input.actor.adminUserId }),
      },
    });

    await transaction.listingImportRow.createMany({
      data: staged.map((stagedRow) => {
        const prepared = stagedRow.prepared;
        return {
          id: stagedRow.rowId,
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
        };
      }),
    });

    const candidates: CandidateToCreate[] = [];
    for (const stagedRow of staged) {
      const prepared = stagedRow.prepared;
      if (
        stagedRow.status === "CANDIDATE_CREATED" &&
        stagedRow.candidateId &&
        stagedRow.sourceRecordId &&
        prepared.status === "VALID"
      ) {
        candidates.push({
          candidateId: stagedRow.candidateId,
          rowId: stagedRow.rowId,
          sourceRecordId: stagedRow.sourceRecordId,
          item: prepared.item,
          normalizedJson: prepared.normalizedJson,
        });
      }
    }

    if (candidates.length > 0) {
      await transaction.listingImportCandidate.createMany({
        data: candidates.map(
          ({
            candidateId,
            rowId,
            sourceRecordId,
            item,
            normalizedJson: payload,
          }) => ({
            id: candidateId,
            sourceRecordId,
            creationObservationId: rowId,
            latestObservationId: rowId,
            currentPayload: jsonWriteValue(payload),
            normalizedTitle: item.normalizedTitle,
            normalizedAddress: item.normalizedAddress || null,
            normalizedCity: item.normalizedCity,
            normalizedPostalCode: item.normalizedPostalCode || null,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
          }),
        ),
      });
    }
    const duplicatesByCandidate = await findPrismaDuplicateTargets(
      transaction,
      candidates.map(({ candidateId, item }) => ({
        candidateId,
        normalizedTitle: item.normalizedTitle,
        normalizedAddress: item.normalizedAddress,
        normalizedPostalCode: item.normalizedPostalCode,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        confirmedPoint: null,
      })),
    );
    const duplicates = candidates.flatMap(({ candidateId }) =>
      (duplicatesByCandidate.get(candidateId) ?? []).map((duplicate) => ({
        candidateId,
        ...(duplicate.targetKind === "EVENT"
          ? { eventId: duplicate.targetId }
          : { externalListingId: duplicate.targetId }),
        reasons: [...duplicate.reasons],
      })),
    );
    if (duplicates.length > 0) {
      await transaction.listingDuplicateMatch.createMany({ data: duplicates });
    }

    if (input.actor.kind === "API_CREDENTIAL") {
      await transaction.listingImportIdempotencyKey.create({
        data: {
          credentialId: input.actor.credentialId,
          idempotencyKeyDigest: input.actor.idempotencyKeyDigest,
          requestDigest: input.requestDigest,
          batchId,
        },
      });
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
    await transaction.auditEntry.createMany({
      data: [
        ...candidates.map(({ candidateId, sourceRecordId, item }) => ({
          actorUserId:
            input.actor.kind === "ADMIN_USER" ? input.actor.adminUserId : null,
          action: "LISTING_IMPORT_CANDIDATE_CREATED",
          targetType: "LISTING_IMPORT_CANDIDATE",
          targetId: candidateId,
          ...(input.audit.requestId
            ? { requestId: input.audit.requestId }
            : {}),
          metadata: jsonDocument(
            candidateAuditMetadata({
              batchId,
              candidateId,
              sourceRecordId,
              contentHash: item.contentHash,
            }),
          ),
        })),
        {
          actorUserId:
            input.actor.kind === "ADMIN_USER" ? input.actor.adminUserId : null,
          action: "LISTING_IMPORT_BATCH_CREATED",
          targetType: "LISTING_IMPORT_BATCH",
          targetId: batchId,
          ...(input.audit.requestId
            ? { requestId: input.audit.requestId }
            : {}),
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
      ],
    });
    await transaction.listingImportBatch.update({
      where: { id: batchId },
      data: { sealedAt: now },
    });

    const results: ListingImportRowResult[] = staged.map((stagedRow) => ({
      rowNumber: stagedRow.prepared.rowNumber,
      status: stagedRow.status,
      candidateId:
        stagedRow.status === "CANDIDATE_CREATED" ? stagedRow.candidateId : null,
      validationCodes:
        stagedRow.prepared.status === "INVALID"
          ? stagedRow.prepared.validationCodes
          : [],
    }));

    return {
      batchId,
      replayed: false,
      status,
      counts,
      rows: results,
    };
  }
}
