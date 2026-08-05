import {
  listingContentHash,
  normalizeListingContent,
  sha256Digest,
  type ListingImportJsonValue,
  type ListingImportRepository,
  type ListingImportSourceConfiguration,
  type ListingImportTransactionInput,
} from "@/modules/listing-imports";

export const source: ListingImportSourceConfiguration = {
  id: "10000000-0000-4000-8000-000000000001",
  key: "fixture",
  allowedHosts: ["fixture.invalid"],
  allowedQueryParameters: ["page", "ref"],
  enabled: true,
  productionAllowed: false,
};

export const manualContext = {
  transport: "MANUAL_JSON" as const,
  actor: {
    kind: "ADMIN_USER" as const,
    adminUserId: "20000000-0000-4000-8000-000000000001",
  },
  audit: { requestId: "listing-import-unit" },
};

export interface FixtureListingItem {
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly contentHash: string;
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
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
  readonly privacyMode: "APPROXIMATE_LOCATION";
}

export function listingItem(
  overrides: Partial<FixtureListingItem> = {},
): FixtureListingItem {
  const base: FixtureListingItem = {
    sourceListingId: "fixture-100",
    sourceUrl: "https://fixture.invalid/listings/fixture-100",
    retrievedAt: "2026-08-04T12:00:00.000Z",
    contentHash: "",
    eventType: "ESTATE_SALE",
    title: "Bakersfield Estate Sale",
    description:
      "Furniture, tools, artwork, and household goods are available.",
    localStartsAt: "2026-08-08T09:00",
    localEndsAt: "2026-08-08T15:00",
    timezone: "America/Los_Angeles",
    addressLine1: "123 Main Street",
    addressLine2: null,
    city: "Bakersfield",
    region: "CA",
    postalCode: "93301",
    countryCode: "US",
    privacyMode: "APPROXIMATE_LOCATION",
  };
  const merged = { ...base, ...overrides };
  if (overrides.contentHash !== undefined) return merged;
  const normalized = normalizeListingContent(merged);
  return { ...merged, contentHash: listingContentHash(normalized) };
}

export function envelope(items: readonly unknown[]) {
  return {
    contractVersion: "listing-import.v1",
    sourceKey: "fixture",
    ingestorRunId: "run-2026-08-04-001",
    ingestorInstanceId: "workstation-fixture",
    parserVersion: "fixture-parser/1.0.0",
    items,
  };
}

function persistenceResult(input: ListingImportTransactionInput) {
  const rows = input.rows.map((row) =>
    row.status === "VALID"
      ? {
          rowNumber: row.rowNumber,
          status: "CANDIDATE_CREATED" as const,
          candidateId: `candidate-${String(row.rowNumber)}`,
          validationCodes: [],
        }
      : {
          rowNumber: row.rowNumber,
          status: "INVALID" as const,
          candidateId: null,
          validationCodes: row.validationCodes,
        },
  );
  const candidateCreated = rows.filter(
    (row) => row.status === "CANDIDATE_CREATED",
  ).length;
  const invalid = rows.filter((row) => row.status === "INVALID").length;
  return {
    batchId: "30000000-0000-4000-8000-000000000001",
    replayed: false,
    status:
      invalid === rows.length
        ? ("REJECTED" as const)
        : invalid > 0
          ? ("PARTIAL" as const)
          : ("COMPLETED" as const),
    counts: {
      total: rows.length,
      candidateCreated,
      invalid,
      exactDuplicate: 0,
      sourceChanged: 0,
      identityConflict: 0,
    },
    rows,
  };
}

export function repository(
  overrides: Partial<ListingImportRepository> = {},
): ListingImportRepository {
  return {
    findSourceByKey: async () => source,
    processBatchAtomically: async (input) => persistenceResult(input),
    ...overrides,
  };
}

export const validDigest = sha256Digest("listing-import-test-digest");

export function asJson(value: ListingImportJsonValue): ListingImportJsonValue {
  return value;
}
