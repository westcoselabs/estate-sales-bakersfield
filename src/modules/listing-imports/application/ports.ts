import type {
  ListingImportBatchStatus,
  ListingImportCounts,
  ListingImportEventType,
  ListingImportPrivacyMode,
  ListingProbableDuplicateReason,
  ListingImportRowResult,
  ListingImportTransport,
  ListingImportValidationCode,
  NormalizedListingImportItem,
} from "../domain/types";

export type ListingImportJsonPrimitive = string | number | boolean | null;
export type ListingImportJsonValue =
  | ListingImportJsonPrimitive
  | readonly ListingImportJsonValue[]
  | ListingImportJsonObject;
export interface ListingImportJsonObject {
  readonly [key: string]: ListingImportJsonValue;
}

export interface ListingImportSourceConfiguration {
  readonly id: string;
  readonly key: string;
  readonly allowedHosts: readonly string[];
  readonly allowedQueryParameters: readonly string[];
  readonly enabled: boolean;
  readonly productionAllowed: boolean;
}

export type ListingImportActor =
  | {
      readonly kind: "API_CREDENTIAL";
      readonly credentialId: string;
      readonly idempotencyKeyDigest: string;
    }
  | {
      readonly kind: "ADMIN_USER";
      readonly adminUserId: string;
    };

export interface ListingImportAuditContext {
  readonly requestId?: string;
}

export interface ListingImportCommandContext {
  readonly transport: ListingImportTransport;
  readonly actor: ListingImportActor;
  readonly requestDigest?: string;
  readonly audit?: ListingImportAuditContext;
}

export interface InvalidPreparedListingImportRow {
  readonly status: "INVALID";
  readonly rowNumber: number;
  readonly inputJson: ListingImportJsonValue;
  readonly validationCodes: readonly ListingImportValidationCode[];
}

export interface ValidPreparedListingImportRow {
  readonly status: "VALID";
  readonly rowNumber: number;
  readonly inputJson: ListingImportJsonObject;
  readonly normalizedJson: ListingImportJsonObject;
  readonly item: NormalizedListingImportItem;
}

export type PreparedListingImportRow =
  InvalidPreparedListingImportRow | ValidPreparedListingImportRow;

export interface ListingImportTransactionInput {
  readonly sourceId: string;
  readonly sourceKey: string;
  /**
   * The source policy used while normalizing the request. Persistence compares
   * this snapshot with the locked transaction view so a policy change cannot
   * race an in-flight import.
   */
  readonly sourcePolicy: Pick<
    ListingImportSourceConfiguration,
    "allowedHosts" | "allowedQueryParameters"
  >;
  readonly requireProductionAllowed: boolean;
  readonly transport: ListingImportTransport;
  readonly actor: ListingImportActor;
  readonly contractVersion: "listing-import.v1";
  readonly parserVersion: string;
  readonly ingestorRunId: string;
  readonly ingestorInstanceId: string;
  readonly requestDigest: string;
  readonly payloadDigest: string;
  readonly rows: readonly PreparedListingImportRow[];
  readonly audit: ListingImportAuditContext;
}

export interface ListingImportPersistenceResult {
  readonly batchId: string;
  readonly replayed: boolean;
  readonly status: ListingImportBatchStatus;
  readonly counts: ListingImportCounts;
  readonly rows: readonly ListingImportRowResult[];
}

export interface ListingImportRepository {
  findSourceByKey(
    sourceKey: string,
  ): Promise<ListingImportSourceConfiguration | null>;

  /**
   * Persists the batch, observations, identity transitions, candidate writes,
   * duplicate matches, and audit records in one serializable transaction.
   */
  processBatchAtomically(
    input: ListingImportTransactionInput,
  ): Promise<ListingImportPersistenceResult>;
}

export interface ListingDuplicateTargetWrite {
  readonly targetKind: "EVENT" | "EXTERNAL_LISTING";
  readonly targetId: string;
  readonly reasons: readonly ListingProbableDuplicateReason[];
}

export interface ListingImportCandidateIndexWrite {
  readonly eventType: ListingImportEventType;
  readonly privacyMode: ListingImportPrivacyMode;
  readonly normalizedTitle: string;
  readonly normalizedAddress: string;
  readonly normalizedCity: string;
  readonly normalizedPostalCode: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}
