import type { PrismaClient } from "@/generated/prisma/client";
import { PrismaListingImportAdminQueryRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-import-admin-query-repository";
import { describe, expect, it, vi } from "vitest";

const candidateId = "10000000-0000-4000-8000-000000000001";
const matchId = "20000000-0000-4000-8000-000000000001";
const source = {
  id: "30000000-0000-4000-8000-000000000001",
  key: "fixture",
  name: "Fixture source",
  productionAllowed: false,
} as const;
const startsAt = new Date("2026-08-15T16:00:00.000Z");
const endsAt = new Date("2026-08-15T22:00:00.000Z");

const currentPayload = {
  sourceListingId: "source-listing-1",
  sourceUrl: "https://fixture.example/sales/source-listing-1",
  retrievedAt: "2026-08-08T12:00:00.000Z",
  contentHash: "a".repeat(64),
  eventType: "ESTATE_SALE",
  title: "Bakersfield Estate Sale",
  description: "A sufficiently detailed imported estate sale description.",
  localStartsAt: "2026-08-15T09:00",
  localEndsAt: "2026-08-15T15:00",
  startsAt: startsAt.toISOString(),
  endsAt: endsAt.toISOString(),
  timezone: "America/Los_Angeles",
  addressLine1: "123 Private Street",
  addressLine2: null,
  city: "Bakersfield",
  region: "CA",
  postalCode: "93301",
  countryCode: "US",
  privacyMode: "APPROXIMATE_LOCATION",
  normalizedTitle: "bakersfield estate sale",
  normalizedAddress: "123 private street bakersfield ca 93301 us",
  normalizedCity: "bakersfield",
  normalizedPostalCode: "93301",
  locationResolution: null,
} as const;

function candidateRecord(
  overrides: {
    readonly status?: "PENDING_REVIEW" | "REJECTED";
    readonly targetStillProbable?: boolean;
  } = {},
) {
  const targetStillProbable = overrides.targetStillProbable ?? true;
  return {
    id: candidateId,
    sourceRecordId: "40000000-0000-4000-8000-000000000001",
    creationObservationId: "50000000-0000-4000-8000-000000000001",
    latestObservationId: "50000000-0000-4000-8000-000000000002",
    currentPayload,
    normalizedTitle: currentPayload.normalizedTitle,
    normalizedAddress: currentPayload.normalizedAddress,
    normalizedCity: currentPayload.normalizedCity,
    normalizedPostalCode: currentPayload.normalizedPostalCode,
    startsAt,
    endsAt,
    latitude: 35.3733,
    longitude: -119.0187,
    locationProviderPlaceId: "fixture-place",
    locationProviderName: "fixture",
    locationProviderVersion: "1",
    locationProviderAttribution: null,
    locationResolutionSource: "ADMIN_GEOCODING",
    locationConfirmationStatus: "CONFIRMED",
    locationConfirmedByUserId: null,
    locationConfirmedAt: new Date("2026-08-08T13:00:00.000Z"),
    status: overrides.status ?? "PENDING_REVIEW",
    version: 3,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: new Date("2026-08-08T12:00:00.000Z"),
    updatedAt: new Date("2026-08-08T13:00:00.000Z"),
    sourceRecord: {
      sourceListingId: currentPayload.sourceListingId,
      canonicalSourceUrl: currentPayload.sourceUrl,
      firstSeenAt: new Date("2026-08-08T12:00:00.000Z"),
      lastSeenAt: new Date("2026-08-08T12:00:00.000Z"),
      lastContentHash: currentPayload.contentHash,
      source,
    },
    creationObservation: {
      contentHash: currentPayload.contentHash,
      batch: { createdAt: new Date("2026-08-08T12:00:00.000Z") },
    },
    latestObservation: { contentHash: currentPayload.contentHash },
    duplicateMatches: [
      {
        id: matchId,
        resolution: "NOT_DUPLICATE",
        reasons: ["FULL_ADDRESS_SCHEDULE_OVERLAP"],
        resolvedByUserId: "60000000-0000-4000-8000-000000000001",
        resolvedAt: new Date("2026-08-08T12:30:00.000Z"),
        createdAt: new Date("2026-08-08T12:15:00.000Z"),
        event: null,
        externalListing: {
          id: "70000000-0000-4000-8000-000000000001",
          publicId: "ABCD1234EFGH",
          title: targetStillProbable ? currentPayload.title : "Unrelated sale",
          canonicalPath: "/sales/ABCD1234EFGH/unrelated-sale",
          status: "PUBLISHED",
          startsAt: targetStillProbable
            ? startsAt
            : new Date("2026-10-01T16:00:00.000Z"),
          endsAt: targetStillProbable
            ? endsAt
            : new Date("2026-10-01T22:00:00.000Z"),
          location: {
            normalizedAddress: targetStillProbable
              ? currentPayload.normalizedAddress
              : "999 other avenue bakersfield ca 99999 us",
            postalCode: targetStillProbable
              ? currentPayload.postalCode
              : "99999",
            latitude: targetStillProbable ? 35.3733 : 36,
            longitude: targetStillProbable ? -119.0187 : -120,
            confirmationStatus: "CONFIRMED",
          },
        },
      },
    ],
    externalListing: null,
    _count: { duplicateMatches: 0 },
  };
}

function candidateRepository(
  candidate: ReturnType<typeof candidateRecord>,
  freshMatchIds: readonly string[],
) {
  const queryRaw = vi
    .fn()
    .mockResolvedValue(freshMatchIds.map((id) => ({ matchId: id })));
  const prisma = {
    listingImportCandidate: {
      findUnique: vi.fn().mockResolvedValue(candidate),
    },
    auditEntry: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: queryRaw,
  } as unknown as PrismaClient;
  return {
    queryRaw,
    repository: new PrismaListingImportAdminQueryRepository(prisma),
  };
}

describe("PrismaListingImportAdminQueryRepository", () => {
  it("projects only city, region, and postal code on candidate overview rows", async () => {
    const candidateFindMany = vi.fn().mockResolvedValue([
      {
        id: candidateId,
        currentPayload,
        normalizedTitle: currentPayload.normalizedTitle,
        normalizedCity: currentPayload.normalizedCity,
        normalizedPostalCode: currentPayload.normalizedPostalCode,
        startsAt,
        endsAt,
        createdAt: new Date("2026-08-08T12:00:00.000Z"),
        status: "PENDING_REVIEW",
        version: 1,
        sourceRecord: { source },
        _count: { duplicateMatches: 0 },
      },
    ]);
    const prisma = {
      listingImportCandidate: {
        count: vi.fn().mockResolvedValue(1),
        findMany: candidateFindMany,
      },
      listingImportBatch: { count: vi.fn().mockResolvedValue(0) },
      externalListing: { count: vi.fn().mockResolvedValue(0) },
      listingIngestionCredential: { count: vi.fn().mockResolvedValue(0) },
      listingImportSource: { findMany: vi.fn().mockResolvedValue([source]) },
    } as unknown as PrismaClient;
    const repository = new PrismaListingImportAdminQueryRepository(prisma);

    const result = await repository.landing({
      view: "candidates",
      cursor: null,
      limit: 25,
    });

    expect(result.active.view).toBe("candidates");
    if (result.active.view !== "candidates") throw new Error("wrong view");
    expect(result.active.page.rows[0]?.locationSummary).toBe(
      "Bakersfield, CA 93301",
    );
    expect(result.active.page.rows[0]?.locationSummary).not.toContain(
      "Private Street",
    );
    const select = candidateFindMany.mock.calls[0]?.[0]?.select;
    expect(select).not.toHaveProperty("normalizedAddress");
    expect(select).toHaveProperty("normalizedPostalCode", true);
  });

  it("projects a stale still-probable decision as recheck-only unresolved", async () => {
    const { repository } = candidateRepository(candidateRecord(), []);

    const result = await repository.candidateDetail(candidateId);

    expect(result?.duplicates[0]).toMatchObject({
      id: matchId,
      resolution: "UNRESOLVED",
      recheckOnly: true,
      reasons: expect.arrayContaining(["FULL_ADDRESS_SCHEDULE_OVERLAP"]),
    });
    expect(result?.unresolvedDuplicateCount).toBe(1);
  });

  it("keeps a current-digest decision resolved", async () => {
    const { repository } = candidateRepository(candidateRecord(), [matchId]);

    const result = await repository.candidateDetail(candidateId);

    expect(result?.duplicates[0]).toMatchObject({
      resolution: "NOT_DUPLICATE",
      recheckOnly: false,
    });
    expect(result?.unresolvedDuplicateCount).toBe(0);
  });

  it("does not reopen an obsolete or terminal resolved target", async () => {
    for (const candidate of [
      candidateRecord({ targetStillProbable: false }),
      candidateRecord({ status: "REJECTED" }),
    ]) {
      const { queryRaw, repository } = candidateRepository(candidate, []);

      const result = await repository.candidateDetail(candidateId);

      expect(result?.duplicates[0]).toMatchObject({
        resolution: "NOT_DUPLICATE",
        recheckOnly: false,
      });
      expect(result?.unresolvedDuplicateCount).toBe(0);
      expect(queryRaw).not.toHaveBeenCalled();
    }
  });
});
