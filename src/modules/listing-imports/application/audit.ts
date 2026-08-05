import type {
  ListingImportCounts,
  ListingImportValidationCode,
} from "../domain/types";

export type ListingImportAuditAction =
  | "LISTING_IMPORT_BATCH_CREATED"
  | "LISTING_IMPORT_CANDIDATE_CREATED"
  | "LISTING_IMPORT_CANDIDATE_UPDATED"
  | "LISTING_IMPORT_CANDIDATE_APPROVED"
  | "LISTING_IMPORT_CANDIDATE_REJECTED"
  | "LISTING_IMPORT_CANDIDATE_DELETED"
  | "LISTING_IMPORT_DUPLICATE_RESOLVED"
  | "LISTING_INGESTION_CREDENTIAL_CREATED"
  | "LISTING_INGESTION_CREDENTIAL_REVOKED"
  | "EXTERNAL_LISTING_EDITED"
  | "EXTERNAL_LISTING_EXPIRED"
  | "EXTERNAL_LISTING_REMOVED"
  | "EXTERNAL_LISTING_COVER_READY";

export interface ListingImportBatchAuditMetadata extends ListingImportCounts {
  readonly batchId: string;
  readonly sourceId: string;
  readonly requestDigest: string;
  readonly payloadDigest: string;
  readonly validationCodes: readonly ListingImportValidationCode[];
}

export interface ListingImportCandidateAuditMetadata {
  readonly batchId: string;
  readonly candidateId: string;
  readonly sourceRecordId: string;
  readonly contentHash: string;
}

export function batchAuditMetadata(input: {
  readonly batchId: string;
  readonly sourceId: string;
  readonly requestDigest: string;
  readonly payloadDigest: string;
  readonly counts: ListingImportCounts;
  readonly validationCodes: readonly ListingImportValidationCode[];
}): ListingImportBatchAuditMetadata {
  return {
    batchId: input.batchId,
    sourceId: input.sourceId,
    requestDigest: input.requestDigest,
    payloadDigest: input.payloadDigest,
    total: input.counts.total,
    candidateCreated: input.counts.candidateCreated,
    invalid: input.counts.invalid,
    exactDuplicate: input.counts.exactDuplicate,
    sourceChanged: input.counts.sourceChanged,
    identityConflict: input.counts.identityConflict,
    validationCodes: [...new Set(input.validationCodes)],
  };
}

export function candidateAuditMetadata(
  input: ListingImportCandidateAuditMetadata,
): ListingImportCandidateAuditMetadata {
  return {
    batchId: input.batchId,
    candidateId: input.candidateId,
    sourceRecordId: input.sourceRecordId,
    contentHash: input.contentHash,
  };
}
