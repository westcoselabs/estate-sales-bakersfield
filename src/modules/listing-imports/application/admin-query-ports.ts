import type {
  ExternalListingStatus,
  ListingDuplicateResolution,
  ListingImportBatchStatus,
  ListingImportCandidateStatus,
  ListingImportEventType,
  ListingImportRowStatus,
  ListingImportTransport,
  ListingImportValidationCode,
  ListingProbableDuplicateReason,
} from "../domain/types";

export const LISTING_IMPORT_ADMIN_VIEWS = [
  "candidates",
  "batches",
  "listings",
  "credentials",
] as const;

export type ListingImportAdminView =
  (typeof LISTING_IMPORT_ADMIN_VIEWS)[number];

export interface ListingImportAdminCursor {
  readonly at: Date;
  readonly id: string;
}

export interface ListingImportAdminPage<T> {
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
}

export interface ListingImportAdminSourceSummary {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly productionAllowed: boolean;
}

export interface ListingImportAdminSummary {
  readonly pendingCandidates: number;
  readonly batches: number;
  readonly publishedListings: number;
  readonly activeCredentials: number;
}

export interface ListingImportAdminCandidateRow {
  readonly id: string;
  readonly title: string;
  readonly source: ListingImportAdminSourceSummary;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly city: string;
  readonly locationSummary: string | null;
  readonly unresolvedDuplicateCount: number;
  readonly importedAt: Date;
  readonly status: ListingImportCandidateStatus;
  readonly version: number;
}

export interface ListingImportAdminBatchCounts {
  readonly total: number;
  readonly candidate: number;
  readonly invalid: number;
  readonly exactDuplicate: number;
  readonly sourceChanged: number;
  readonly identityConflict: number;
}

export interface ListingImportAdminBatchRow {
  readonly id: string;
  readonly source: ListingImportAdminSourceSummary;
  readonly transport: ListingImportTransport;
  readonly parserVersion: string;
  readonly ingestorRunId: string;
  readonly ingestorInstanceId: string;
  readonly counts: ListingImportAdminBatchCounts;
  readonly status: ListingImportBatchStatus;
  readonly createdAt: Date;
}

export interface ListingImportAdminExternalListingRow {
  readonly id: string;
  readonly title: string;
  readonly source: ListingImportAdminSourceSummary;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: ExternalListingStatus;
  readonly publishedAt: Date;
  readonly version: number;
}

export interface ListingImportAdminCredentialRow {
  readonly id: string;
  readonly name: string;
  readonly source: ListingImportAdminSourceSummary;
  readonly displayPrefix: string;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
}

export type ListingImportAdminLandingPage =
  | {
      readonly view: "candidates";
      readonly page: ListingImportAdminPage<ListingImportAdminCandidateRow>;
    }
  | {
      readonly view: "batches";
      readonly page: ListingImportAdminPage<ListingImportAdminBatchRow>;
    }
  | {
      readonly view: "listings";
      readonly page: ListingImportAdminPage<ListingImportAdminExternalListingRow>;
    }
  | {
      readonly view: "credentials";
      readonly page: ListingImportAdminPage<ListingImportAdminCredentialRow>;
    };

export interface ListingImportAdminLandingResult {
  readonly summary: ListingImportAdminSummary;
  readonly sources: readonly ListingImportAdminSourceSummary[];
  readonly active: ListingImportAdminLandingPage;
}

export interface ListingImportAdminLandingQuery {
  readonly view: ListingImportAdminView;
  readonly cursor: ListingImportAdminCursor | null;
  readonly limit: number;
}

export interface ListingImportAdminRepositoryPage<T> {
  readonly rows: readonly T[];
  readonly next: ListingImportAdminCursor | null;
}

export type ListingImportAdminRepositoryLandingPage =
  | {
      readonly view: "candidates";
      readonly page: ListingImportAdminRepositoryPage<ListingImportAdminCandidateRow>;
    }
  | {
      readonly view: "batches";
      readonly page: ListingImportAdminRepositoryPage<ListingImportAdminBatchRow>;
    }
  | {
      readonly view: "listings";
      readonly page: ListingImportAdminRepositoryPage<ListingImportAdminExternalListingRow>;
    }
  | {
      readonly view: "credentials";
      readonly page: ListingImportAdminRepositoryPage<ListingImportAdminCredentialRow>;
    };

export interface ListingImportAdminRepositoryLandingResult {
  readonly summary: ListingImportAdminSummary;
  readonly sources: readonly ListingImportAdminSourceSummary[];
  readonly active: ListingImportAdminRepositoryLandingPage;
}

export interface ListingImportAdminBatchObservation {
  readonly rowNumber: number;
  readonly status: ListingImportRowStatus;
  readonly validationCodes: readonly ListingImportValidationCode[];
  readonly candidateId: string | null;
  readonly observedAt: Date;
}

export interface ListingImportAdminBatchDetail {
  readonly id: string;
  readonly source: ListingImportAdminSourceSummary;
  readonly transport: ListingImportTransport;
  readonly contractVersion: string;
  readonly parserVersion: string;
  readonly ingestorRunId: string;
  readonly ingestorInstanceId: string;
  readonly counts: ListingImportAdminBatchCounts;
  readonly status: ListingImportBatchStatus;
  readonly createdAt: Date;
  readonly completedAt: Date;
  readonly sealedAt: Date | null;
  readonly rows: readonly ListingImportAdminBatchObservation[];
}

export type ListingImportAdminPrivacyMode =
  "APPROXIMATE_LOCATION" | "EXACT_ADDRESS";

export interface ListingImportAdminCandidatePayload {
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
  readonly privacyMode: ListingImportAdminPrivacyMode;
}

export interface ListingImportAdminCandidateLocation {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly providerPlaceId: string | null;
  readonly providerName: string | null;
  readonly providerVersion: string | null;
  readonly providerAttribution: string | null;
  readonly resolutionSource:
    | "ORGANIZER_AUTOCOMPLETE"
    | "ADMIN_GEOCODING"
    | "LEGACY_PROVIDER"
    | "UNCONFIRMED_DRAFT";
  readonly confirmationStatus: "UNCONFIRMED" | "CONFIRMED";
  readonly confirmedByUserId: string | null;
  readonly confirmedAt: Date | null;
}

export type ListingImportAdminDuplicateTarget =
  | {
      readonly kind: "EVENT";
      readonly id: string;
      readonly publicId: string;
      readonly title: string;
      readonly canonicalPath: string | null;
      readonly publicationState: "PUBLISHED" | "UNPUBLISHED";
      readonly endsAt: Date | null;
      readonly linkAvailable: boolean;
    }
  | {
      readonly kind: "EXTERNAL_LISTING";
      readonly id: string;
      readonly publicId: string;
      readonly title: string;
      readonly canonicalPath: string;
      readonly status: ExternalListingStatus;
      readonly endsAt: Date;
      readonly linkAvailable: boolean;
    };

export interface ListingImportAdminDuplicateMatch {
  readonly id: string;
  readonly resolution: ListingDuplicateResolution;
  readonly reasons: readonly ListingProbableDuplicateReason[];
  readonly resolvedByUserId: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
  readonly target: ListingImportAdminDuplicateTarget;
}

export interface ListingImportAdminAuditEntry {
  readonly id: string;
  readonly action: string;
  readonly occurredAt: Date;
  readonly requestId: string | null;
}

export interface ListingImportAdminCandidateDetailRecord {
  readonly id: string;
  readonly sourceRecordId: string;
  readonly creationObservationId: string;
  readonly latestObservationId: string;
  readonly currentPayload: unknown;
  readonly normalizedTitle: string;
  readonly normalizedAddress: string | null;
  readonly normalizedCity: string;
  readonly normalizedPostalCode: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly location: ListingImportAdminCandidateLocation;
  readonly status: ListingImportCandidateStatus;
  readonly version: number;
  readonly reviewedByUserId: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly provenance: {
    readonly source: ListingImportAdminSourceSummary;
    readonly sourceListingId: string;
    readonly canonicalSourceUrl: string;
    readonly firstSeenAt: Date;
    readonly lastSeenAt: Date;
    readonly lastContentHash: string;
    readonly creationContentHash: string | null;
    readonly latestContentHash: string | null;
    readonly importedAt: Date;
  };
  readonly duplicates: readonly ListingImportAdminDuplicateMatch[];
  readonly duplicatesTruncated: boolean;
  readonly unresolvedDuplicateCount: number;
  readonly audit: readonly ListingImportAdminAuditEntry[];
  readonly auditTruncated: boolean;
  readonly externalListingId: string | null;
}

export interface ListingImportAdminCandidateDetail extends Omit<
  ListingImportAdminCandidateDetailRecord,
  "currentPayload" | "audit"
> {
  readonly payload: ListingImportAdminCandidatePayload | null;
  readonly payloadValid: boolean;
  readonly audit: readonly ListingImportAdminAuditEntry[];
}

export interface ListingImportAdminExternalLocation {
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly normalizedAddress: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly timezone: string;
  readonly providerPlaceId: string | null;
  readonly providerName: string | null;
  readonly providerVersion: string | null;
  readonly providerAttribution: string | null;
  readonly resolutionSource:
    | "ORGANIZER_AUTOCOMPLETE"
    | "ADMIN_GEOCODING"
    | "LEGACY_PROVIDER"
    | "UNCONFIRMED_DRAFT";
  readonly confirmationStatus: "UNCONFIRMED" | "CONFIRMED";
  readonly confirmedByUserId: string | null;
  readonly confirmedAt: Date | null;
  readonly publicZone: string;
  readonly precision: string | null;
  readonly confidence: number | null;
  readonly validationStatus: "UNVALIDATED" | "VERIFIED" | "LOW_CONFIDENCE";
}

export interface ListingImportAdminExternalListingDetailRecord {
  readonly id: string;
  readonly candidateId: string;
  readonly primarySourceRecordId: string;
  readonly publicId: string;
  readonly slug: string;
  readonly canonicalPath: string;
  readonly eventType: ListingImportEventType;
  readonly title: string;
  readonly description: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly privacyMode:
    "EXACT_ADDRESS" | "APPROXIMATE_LOCATION" | "HIDDEN_UNTIL_START";
  readonly status: ExternalListingStatus;
  readonly version: number;
  readonly attribution: unknown;
  readonly publishedAt: Date;
  readonly expiredAt: Date | null;
  readonly removedAt: Date | null;
  readonly removalReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly provenance: {
    readonly source: ListingImportAdminSourceSummary;
    readonly sourceListingId: string;
    readonly canonicalSourceUrl: string;
    readonly firstSeenAt: Date;
    readonly lastSeenAt: Date;
    readonly lastContentHash: string;
  };
  readonly location: ListingImportAdminExternalLocation | null;
  readonly audit: readonly ListingImportAdminAuditEntry[];
  readonly auditTruncated: boolean;
}

export type ListingImportAdminJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ListingImportAdminJsonValue[]
  | { readonly [key: string]: ListingImportAdminJsonValue };

export interface ListingImportAdminExternalListingDetail extends Omit<
  ListingImportAdminExternalListingDetailRecord,
  "attribution" | "audit"
> {
  readonly attribution: Readonly<
    Record<string, ListingImportAdminJsonValue>
  > | null;
  readonly attributionValid: boolean;
  readonly audit: readonly ListingImportAdminAuditEntry[];
}

export interface ListingImportAdminQueryRepository {
  landing(
    query: ListingImportAdminLandingQuery,
  ): Promise<ListingImportAdminRepositoryLandingResult>;
  batchDetail(id: string): Promise<ListingImportAdminBatchDetail | null>;
  candidateDetail(
    id: string,
  ): Promise<ListingImportAdminCandidateDetailRecord | null>;
  externalListingDetail(
    id: string,
  ): Promise<ListingImportAdminExternalListingDetailRecord | null>;
}
