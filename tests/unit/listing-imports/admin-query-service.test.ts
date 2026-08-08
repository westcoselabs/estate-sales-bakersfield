import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "@/modules/auth";
import { AuthenticationError, AuthorizationError } from "@/modules/auth";
import {
  decodeListingImportAdminCursor,
  listingImportAdminLandingCriteria,
} from "@/modules/listing-imports/application/admin-criteria";
import type {
  ListingImportAdminCandidateDetailRecord,
  ListingImportAdminExternalListingDetailRecord,
  ListingImportAdminQueryRepository,
} from "@/modules/listing-imports/application/admin-query-ports";
import { ListingImportAdminQueryService } from "@/modules/listing-imports/application/listing-import-admin-query-service";

const administrator: AuthPrincipal = {
  id: "10000000-0000-4000-8000-000000000001",
  displayName: "Import Administrator",
  email: "admin@example.test",
  emailVerifiedAt: new Date("2026-08-07T17:00:00.000Z"),
  role: "SUPER_ADMIN",
  status: "ACTIVE",
};

const source = {
  id: "20000000-0000-4000-8000-000000000001",
  key: "fixture",
  name: "Fixture source",
  productionAllowed: false,
} as const;

const candidateId = "30000000-0000-4000-8000-000000000001";
const sourceRecordId = "40000000-0000-4000-8000-000000000001";
const observationId = "50000000-0000-4000-8000-000000000001";
const listingId = "60000000-0000-4000-8000-000000000001";

const repository = {
  landing: vi.fn<ListingImportAdminQueryRepository["landing"]>(),
  batchDetail: vi.fn<ListingImportAdminQueryRepository["batchDetail"]>(),
  candidateDetail:
    vi.fn<ListingImportAdminQueryRepository["candidateDetail"]>(),
  externalListingDetail:
    vi.fn<ListingImportAdminQueryRepository["externalListingDetail"]>(),
};

const service = new ListingImportAdminQueryService(repository);

function candidateRecord(
  currentPayload: unknown,
): ListingImportAdminCandidateDetailRecord {
  return {
    id: candidateId,
    sourceRecordId,
    creationObservationId: observationId,
    latestObservationId: observationId,
    currentPayload,
    normalizedTitle: "fixture sale",
    normalizedAddress: "123 main st bakersfield ca 93301 us",
    normalizedCity: "bakersfield",
    normalizedPostalCode: "93301",
    startsAt: new Date("2026-08-08T16:00:00.000Z"),
    endsAt: new Date("2026-08-08T22:00:00.000Z"),
    location: {
      latitude: null,
      longitude: null,
      providerPlaceId: null,
      providerName: null,
      providerVersion: null,
      providerAttribution: null,
      resolutionSource: "UNCONFIRMED_DRAFT",
      confirmationStatus: "UNCONFIRMED",
      confirmedByUserId: null,
      confirmedAt: null,
    },
    status: "PENDING_REVIEW",
    version: 1,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: new Date("2026-08-07T18:00:00.000Z"),
    updatedAt: new Date("2026-08-07T18:00:00.000Z"),
    provenance: {
      source,
      sourceListingId: "fixture-1",
      canonicalSourceUrl: "https://fixture.invalid/listings/fixture-1",
      firstSeenAt: new Date("2026-08-07T18:00:00.000Z"),
      lastSeenAt: new Date("2026-08-07T18:00:00.000Z"),
      lastContentHash: "a".repeat(64),
      creationContentHash: "a".repeat(64),
      latestContentHash: "a".repeat(64),
      importedAt: new Date("2026-08-07T18:00:00.000Z"),
    },
    duplicates: [],
    duplicatesTruncated: false,
    unresolvedDuplicateCount: 0,
    audit: [
      {
        id: "1",
        action: "LISTING_IMPORT_CANDIDATE_CREATED",
        occurredAt: new Date("2026-08-07T18:00:00.000Z"),
        requestId: "safe-request-id",
      },
      {
        id: "2",
        action: "UNSAFE_PRIVATE_AUDIT_ACTION",
        occurredAt: new Date("2026-08-07T18:00:00.000Z"),
        requestId: null,
      },
    ],
    auditTruncated: false,
    externalListingId: null,
  };
}

function validPayload() {
  return {
    eventType: "ESTATE_SALE",
    title: "Fixture Estate Sale",
    description: "A sufficiently complete fixture listing description.",
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
    sourceUrl: "https://fixture.invalid/listings/fixture-1?private=ignored",
    unexpectedPrivateField: "must not escape",
  };
}

function externalRecord(
  attribution: unknown,
): ListingImportAdminExternalListingDetailRecord {
  const startsAt = new Date("2026-08-08T16:00:00.000Z");
  const endsAt = new Date("2026-08-08T22:00:00.000Z");
  return {
    id: listingId,
    candidateId,
    primarySourceRecordId: sourceRecordId,
    publicId: "abc123def456",
    slug: "fixture-estate-sale",
    canonicalPath: "/estate-sales/fixture-estate-sale-abc123def456",
    eventType: "ESTATE_SALE",
    title: "Fixture Estate Sale",
    description: "A sufficiently complete fixture listing description.",
    localStartsAt: "2026-08-08T09:00",
    localEndsAt: "2026-08-08T15:00",
    startsAt,
    endsAt,
    timezone: "America/Los_Angeles",
    privacyMode: "APPROXIMATE_LOCATION",
    status: "PUBLISHED",
    version: 1,
    attribution,
    publishedAt: new Date("2026-08-07T18:00:00.000Z"),
    expiredAt: null,
    removedAt: null,
    removalReason: null,
    createdAt: new Date("2026-08-07T18:00:00.000Z"),
    updatedAt: new Date("2026-08-07T18:00:00.000Z"),
    provenance: {
      source,
      sourceListingId: "fixture-1",
      canonicalSourceUrl: "https://fixture.invalid/listings/fixture-1",
      firstSeenAt: new Date("2026-08-07T18:00:00.000Z"),
      lastSeenAt: new Date("2026-08-07T18:00:00.000Z"),
      lastContentHash: "a".repeat(64),
    },
    location: null,
    audit: [],
    auditTruncated: false,
  };
}

beforeEach(() => {
  repository.landing.mockReset();
  repository.batchDetail.mockReset();
  repository.candidateDetail.mockReset();
  repository.externalListingDetail.mockReset();
});

describe("listing import admin query service", () => {
  it("authorizes every read before repository access", async () => {
    await expect(
      service.landing(null, listingImportAdminLandingCriteria({})),
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(
      service.candidateDetail(
        { ...administrator, emailVerifiedAt: null },
        candidateId,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(repository.landing).not.toHaveBeenCalled();
    expect(repository.candidateDetail).not.toHaveBeenCalled();
  });

  it("returns only the selected landing view and emits a view-bound cursor", async () => {
    const next = {
      at: new Date("2026-08-07T18:00:00.000Z"),
      id: candidateId,
    };
    repository.landing.mockResolvedValue({
      summary: {
        pendingCandidates: 1,
        batches: 2,
        publishedListings: 3,
        activeCredentials: 4,
      },
      sources: [source],
      active: {
        view: "candidates",
        page: { rows: [], next },
      },
    });
    const criteria = listingImportAdminLandingCriteria({
      view: "candidates",
      limit: "10",
    });
    const result = await service.landing(administrator, criteria);

    expect(repository.landing).toHaveBeenCalledOnce();
    expect(result.active.view).toBe("candidates");
    expect(
      decodeListingImportAdminCursor(
        result.active.page.nextCursor ?? undefined,
        "candidates",
      ),
    ).toEqual(next);
  });

  it("rejects a repository result for a different active view", async () => {
    repository.landing.mockResolvedValue({
      summary: {
        pendingCandidates: 0,
        batches: 0,
        publishedListings: 0,
        activeCredentials: 0,
      },
      sources: [],
      active: { view: "batches", page: { rows: [], next: null } },
    });
    await expect(
      service.landing(
        administrator,
        listingImportAdminLandingCriteria({ view: "candidates" }),
      ),
    ).rejects.toThrow(/wrong view/iu);
  });

  it("validates and strips candidate payload fields and allowlists audit actions", async () => {
    repository.candidateDetail.mockResolvedValue(
      candidateRecord(validPayload()),
    );
    const detail = await service.candidateDetail(administrator, candidateId);

    expect(detail?.payloadValid).toBe(true);
    expect(detail?.payload).toEqual({
      eventType: "ESTATE_SALE",
      title: "Fixture Estate Sale",
      description: "A sufficiently complete fixture listing description.",
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
    });
    expect(detail?.audit.map((entry) => entry.action)).toEqual([
      "LISTING_IMPORT_CANDIDATE_CREATED",
    ]);

    repository.candidateDetail.mockResolvedValueOnce(
      candidateRecord({ ...validPayload(), title: "x" }),
    );
    const invalid = await service.candidateDetail(administrator, candidateId);
    expect(invalid?.payloadValid).toBe(false);
    expect(invalid?.payload).toBeNull();
  });

  it("bounds and validates external attribution without reflecting hostile objects", async () => {
    repository.externalListingDetail.mockResolvedValue(
      externalRecord({ sourceLabel: "Fixture source", nested: { safe: true } }),
    );
    const detail = await service.externalListingDetail(
      administrator,
      listingId,
    );
    expect(detail?.attributionValid).toBe(true);
    expect(detail?.attribution).toEqual({
      sourceLabel: "Fixture source",
      nested: { safe: true },
    });

    repository.externalListingDetail.mockResolvedValueOnce(
      externalRecord({ sourceLabel: "x".repeat(4097) }),
    );
    const invalid = await service.externalListingDetail(
      administrator,
      listingId,
    );
    expect(invalid?.attributionValid).toBe(false);
    expect(invalid?.attribution).toBeNull();
  });

  it("preserves not-found detail results", async () => {
    repository.batchDetail.mockResolvedValue(null);
    repository.candidateDetail.mockResolvedValue(null);
    repository.externalListingDetail.mockResolvedValue(null);
    await expect(
      service.batchDetail(administrator, candidateId),
    ).resolves.toBeNull();
    await expect(
      service.candidateDetail(administrator, candidateId),
    ).resolves.toBeNull();
    await expect(
      service.externalListingDetail(administrator, listingId),
    ).resolves.toBeNull();
  });
});
