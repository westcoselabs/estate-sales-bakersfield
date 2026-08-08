import { describe, expect, it, vi } from "vitest";

import type { LocationProvider, ValidatedLocation } from "@/modules/locations";
import { ListingImportReviewService } from "@/modules/listing-imports/application/listing-import-review-service";
import type {
  CandidateLocationInput,
  CandidateReviewMutationResult,
  ExternalListingMutationResult,
  ListingImportReviewActor,
  ListingImportReviewRepository,
} from "@/modules/listing-imports/application/review-ports";

const now = new Date("2026-08-07T18:00:00.000Z");
const actor: ListingImportReviewActor = {
  userId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000001",
};
const locationInput: CandidateLocationInput = {
  addressLine1: "123 Main Street",
  addressLine2: null,
  city: "Bakersfield",
  region: "CA",
  postalCode: "93301",
  countryCode: "US",
  timezone: "America/Los_Angeles",
};
const validatedLocation: ValidatedLocation = {
  ...locationInput,
  normalizedAddress: "123 main street bakersfield ca 93301 us",
  latitude: 35.3733,
  longitude: -119.0187,
  providerPlaceId: "fixture-place-1",
  providerName: "test-fixture",
  precision: "building",
  confidence: 0.99,
  validationStatus: "VERIFIED",
};
const candidateResult: CandidateReviewMutationResult = {
  candidateId: "30000000-0000-4000-8000-000000000001",
  version: 4,
  status: "PENDING_REVIEW",
  unresolvedDuplicateCount: 0,
};
const listingResult: ExternalListingMutationResult = {
  listingId: "40000000-0000-4000-8000-000000000001",
  version: 2,
  status: "PUBLISHED",
  canonicalPath: "/estate-sales/bakersfield-estate-sale-abcdef123456",
  previousCanonicalPath: "/estate-sales/original-estate-sale-abcdef123456",
};

function candidateEdit() {
  return {
    expectedVersion: 3,
    eventType: "ESTATE_SALE",
    title: "  Bakersfield   Estate Sale  ",
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
}

function repository(): ListingImportReviewRepository {
  return {
    candidateLocationInput: vi.fn(async () => locationInput),
    editCandidate: vi.fn(async () => candidateResult),
    confirmCandidateLocation: vi.fn(async () => candidateResult),
    recomputeCandidateDuplicates: vi.fn(async () => candidateResult),
    resolveCandidateDuplicate: vi.fn(async () => ({
      ...candidateResult,
      matchId: "50000000-0000-4000-8000-000000000001",
      resolution: "NOT_DUPLICATE" as const,
    })),
    approveCandidate: vi.fn(async () => ({
      ...candidateResult,
      version: 4,
      status: "APPROVED" as const,
      listingId: listingResult.listingId,
      listingVersion: 1,
      publicId: "abcdef123456",
      canonicalPath: listingResult.canonicalPath,
    })),
    rejectCandidate: vi.fn(async () => ({
      ...candidateResult,
      status: "REJECTED" as const,
    })),
    deleteCandidate: vi.fn(async () => ({
      ...candidateResult,
      status: "DELETED" as const,
    })),
    editExternalListing: vi.fn(async () => listingResult),
    removeExternalListing: vi.fn(async () => ({
      ...listingResult,
      status: "REMOVED" as const,
    })),
  };
}

function locationProvider(): LocationProvider {
  return { validate: vi.fn(async () => validatedLocation) };
}

describe("ListingImportReviewService", () => {
  it("normalizes candidate edits before invoking persistence", async () => {
    const reviews = repository();
    const service = new ListingImportReviewService(
      reviews,
      locationProvider(),
      () => now,
    );

    await service.editCandidate(
      actor,
      candidateResult.candidateId,
      candidateEdit(),
      { requestId: "review-edit" },
    );

    expect(reviews.editCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: candidateResult.candidateId,
        expectedVersion: 3,
        now,
        audit: { requestId: "review-edit" },
        authorization: expect.objectContaining({
          actor,
          authorizationAt: now,
          requireRecentSession: false,
        }),
        content: expect.objectContaining({
          title: "Bakersfield Estate Sale",
          normalizedTitle: "bakersfield estate sale",
          normalizedAddress: "123 main street bakersfield ca 93301 us",
          startsAt: new Date("2026-08-08T16:00:00.000Z"),
        }),
      }),
    );
  });

  it("resolves location through the server provider before persistence", async () => {
    const reviews = repository();
    const locations = locationProvider();
    const service = new ListingImportReviewService(
      reviews,
      locations,
      () => now,
    );

    await service.confirmCandidateLocation(actor, candidateResult.candidateId, {
      expectedVersion: 3,
    });

    expect(locations.validate).toHaveBeenCalledWith(locationInput);
    expect(reviews.confirmCandidateLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedLocationInput: locationInput,
        location: validatedLocation,
        expectedVersion: 3,
      }),
    );
  });

  it("normalizes editable external content without requiring recent authentication", async () => {
    const reviews = repository();
    const service = new ListingImportReviewService(
      reviews,
      locationProvider(),
      () => now,
    );

    await service.editExternalListing(
      { userId: actor.userId },
      listingResult.listingId,
      {
        expectedVersion: 1,
        eventType: "YARD_SALE",
        title: "  Updated   Yard Sale  ",
        description:
          "Updated furniture, tools, artwork, and household goods listing.",
        localStartsAt: "2026-08-09T08:00",
        localEndsAt: "2026-08-09T14:00",
        timezone: "America/Los_Angeles",
        privacyMode: "EXACT_ADDRESS",
      },
    );

    expect(reviews.editExternalListing).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: listingResult.listingId,
        expectedVersion: 1,
        authorization: expect.objectContaining({
          requireRecentSession: false,
        }),
        content: expect.objectContaining({
          eventType: "YARD_SALE",
          title: "Updated Yard Sale",
          normalizedTitle: "updated yard sale",
          startsAt: new Date("2026-08-09T15:00:00.000Z"),
          privacyMode: "EXACT_ADDRESS",
        }),
      }),
    );
  });

  it.each([
    [
      "approve",
      (service: ListingImportReviewService) =>
        service.approveCandidate(
          { userId: actor.userId },
          candidateResult.candidateId,
          { expectedVersion: 3 },
        ),
    ],
    [
      "reject",
      (service: ListingImportReviewService) =>
        service.rejectCandidate(
          { userId: actor.userId },
          candidateResult.candidateId,
          { expectedVersion: 3, reason: "Not suitable for publication" },
        ),
    ],
    [
      "delete",
      (service: ListingImportReviewService) =>
        service.deleteCandidate(
          { userId: actor.userId },
          candidateResult.candidateId,
          {
            expectedVersion: 3,
            reason: "Development test candidate",
            confirmation: "DELETE",
          },
        ),
    ],
    [
      "remove",
      (service: ListingImportReviewService) =>
        service.removeExternalListing(
          { userId: actor.userId },
          listingResult.listingId,
          {
            expectedVersion: 1,
            reason: "No longer available",
            confirmation: "REMOVE",
          },
        ),
    ],
  ])("requires recent-session context for %s", async (_name, invoke) => {
    const reviews = repository();
    const service = new ListingImportReviewService(
      reviews,
      locationProvider(),
      () => now,
    );
    await expect(invoke(service)).rejects.toMatchObject({
      code: "ACTOR_NOT_AUTHORIZED",
      status: 403,
    });
  });

  it("requires recent authorization only for the terminal LINKED resolution", async () => {
    const reviews = repository();
    const service = new ListingImportReviewService(
      reviews,
      locationProvider(),
      () => now,
    );
    const actorWithoutSession = { userId: actor.userId };

    await service.resolveCandidateDuplicate(
      actorWithoutSession,
      candidateResult.candidateId,
      "50000000-0000-4000-8000-000000000001",
      { expectedVersion: 3, resolution: "NOT_DUPLICATE" },
    );
    await expect(
      service.resolveCandidateDuplicate(
        actorWithoutSession,
        candidateResult.candidateId,
        "50000000-0000-4000-8000-000000000001",
        { expectedVersion: 3, resolution: "LINKED" },
      ),
    ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });

    expect(reviews.resolveCandidateDuplicate).toHaveBeenCalledOnce();
  });
});
