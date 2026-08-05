export const LISTING_IMPORT_CONTRACT_VERSION = "listing-import.v1" as const;
export const LISTING_IMPORT_RESULT_VERSION =
  "listing-import-result.v1" as const;

export type ListingImportTransport = "API" | "MANUAL_JSON" | "MANUAL_CSV";
export type ListingImportBatchStatus = "COMPLETED" | "PARTIAL" | "REJECTED";
export type ListingImportRowStatus =
  | "CANDIDATE_CREATED"
  | "INVALID"
  | "EXACT_DUPLICATE"
  | "SOURCE_CHANGED"
  | "IDENTITY_CONFLICT";
export type ListingImportCandidateStatus =
  "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "DUPLICATE_LINKED" | "DELETED";
export type ListingDuplicateResolution =
  "UNRESOLVED" | "NOT_DUPLICATE" | "LINKED";
export type ExternalListingStatus = "PUBLISHED" | "EXPIRED" | "REMOVED";

export type ListingImportEventType = "ESTATE_SALE" | "YARD_SALE";
export type ListingImportPrivacyMode = "APPROXIMATE_LOCATION";

export type ListingImportValidationCode =
  | "ITEM_INVALID"
  | "SOURCE_LISTING_ID_INVALID"
  | "SOURCE_URL_INVALID"
  | "SOURCE_HOST_NOT_ALLOWED"
  | "SOURCE_QUERY_PARAMETER_NOT_ALLOWED"
  | "RETRIEVED_AT_INVALID"
  | "CONTENT_HASH_INVALID"
  | "CONTENT_HASH_MISMATCH"
  | "EVENT_TYPE_INVALID"
  | "TITLE_INVALID"
  | "DESCRIPTION_INVALID"
  | "LOCAL_STARTS_AT_INVALID"
  | "LOCAL_ENDS_AT_INVALID"
  | "TIMEZONE_INVALID"
  | "SCHEDULE_INVALID"
  | "ADDRESS_LINE_1_INVALID"
  | "ADDRESS_LINE_2_INVALID"
  | "CITY_INVALID"
  | "REGION_INVALID"
  | "POSTAL_CODE_INVALID"
  | "COUNTRY_CODE_INVALID"
  | "PRIVACY_MODE_INVALID";

/**
 * The exact, ordered content object covered by a listing's content hash.
 * Source identity and all retrieval/run metadata are deliberately excluded.
 */
export interface CanonicalListingImportContent {
  readonly eventType: ListingImportEventType;
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: string;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly privacyMode: ListingImportPrivacyMode;
}

export interface NormalizedListingImportItem extends CanonicalListingImportContent {
  readonly sourceListingId: string;
  readonly canonicalSourceUrl: string;
  readonly retrievedAt: Date;
  readonly contentHash: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly normalizedTitle: string;
  readonly normalizedAddress: string;
  readonly normalizedCity: string;
  readonly normalizedPostalCode: string;
}

export interface ListingImportEnvelope {
  readonly contractVersion: typeof LISTING_IMPORT_CONTRACT_VERSION;
  readonly sourceKey: string;
  readonly ingestorRunId: string;
  readonly ingestorInstanceId: string;
  readonly parserVersion: string;
  readonly items: readonly unknown[];
}

export interface ListingImportCounts {
  readonly total: number;
  readonly candidateCreated: number;
  readonly invalid: number;
  readonly exactDuplicate: number;
  readonly sourceChanged: number;
  readonly identityConflict: number;
}

export interface ListingImportRowResult {
  readonly rowNumber: number;
  readonly status: ListingImportRowStatus;
  readonly candidateId: string | null;
  readonly validationCodes: readonly ListingImportValidationCode[];
}

export interface ListingImportResult {
  readonly contractVersion: typeof LISTING_IMPORT_RESULT_VERSION;
  readonly batchId: string;
  readonly replayed: boolean;
  readonly status: ListingImportBatchStatus;
  readonly counts: ListingImportCounts;
  readonly rows: readonly ListingImportRowResult[];
}

export interface ListingIdentityObservation {
  readonly sourceListingId: string;
  readonly canonicalSourceUrl: string;
  readonly contentHash: string;
}

export type ListingIdentityDisposition = Exclude<
  ListingImportRowStatus,
  "INVALID"
>;

export type ListingProbableDuplicateReason =
  | "FULL_ADDRESS_SCHEDULE_OVERLAP"
  | "TITLE_POSTAL_DATE_SIMILARITY"
  | "CONFIRMED_LOCATION_SCHEDULE_OVERLAP";

export interface ListingDuplicateComparable {
  readonly normalizedTitle: string;
  readonly normalizedAddress: string;
  readonly normalizedPostalCode: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly confirmedPoint: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
}
