import { createHash, randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LocationProvider } from "@/modules/locations/application/location-provider";
import type {
  LocationInput,
  ValidatedLocation,
} from "@/modules/locations/domain/types";
import { normalizedFullAddress } from "@/modules/listing-imports";
import { PublicSearchService } from "@/modules/public-search/application/public-search-service";
import type { PublicSearchCriteria } from "@/modules/public-search/domain/types";
import { PrismaPublicSearchRepository } from "@/modules/public-search/infrastructure/prisma-public-search-repository";

import { createIntegrationClient } from "./support/database";
import {
  createListingImportReviewHarness,
  type ListingImportReviewHarness,
  type ReviewFixture,
} from "./support/listing-import-review-fixtures";
import { testEmail } from "./support/test-run";

const prisma = createIntegrationClient();
const search = new PublicSearchService(
  new PrismaPublicSearchRepository(prisma),
);
const criteria: PublicSearchCriteria = {
  sale: "all",
  date: "all",
  from: null,
  to: null,
  location: "bakersfield-ca",
  sort: "soonest",
  view: "list",
  cursor: null,
};
let harness: ListingImportReviewHarness;

class ReleasedHiddenLocationProvider implements LocationProvider {
  validate(input: LocationInput): Promise<ValidatedLocation> {
    return Promise.resolve({
      ...input,
      normalizedAddress: `${input.addressLine1}, ${input.city}, ${input.region} ${input.postalCode}, ${input.countryCode}`,
      latitude: 35.55,
      longitude: -119.25,
      providerPlaceId: "released-hidden-location",
      providerName: "integration-fixture",
      precision: "exact",
      confidence: 1,
      validationStatus: "VERIFIED",
    });
  }
}

beforeAll(async () => {
  harness = await createListingImportReviewHarness(prisma, {
    baseCalendarDate: "2125-05-01",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function approveExternal(fixture: ReviewFixture) {
  const candidate = await harness.createCandidate(fixture);
  const confirmed = await harness.confirmCandidate(candidate.candidateId);
  return harness.reviews.approveCandidate(
    harness.actor(),
    candidate.candidateId,
    { expectedVersion: confirmed.version },
  );
}

interface OrganizerPublicationOptions {
  readonly coordinates?: readonly [longitude: number, latitude: number];
  readonly privacyMode?: "APPROXIMATE_LOCATION" | "HIDDEN_UNTIL_START";
}

async function createPaidOrganizerPublication(
  fixture: ReviewFixture,
  options: OrganizerPublicationOptions = {},
) {
  const suffix = randomUUID().slice(0, 8);
  const publicId = randomBytes(6).toString("hex");
  const [longitude, latitude] = options.coordinates ?? [-119.018712, 35.373292];
  const privacyMode = options.privacyMode ?? fixture.content.privacyMode;
  const digest = createHash("sha256")
    .update(`public-search-${suffix}`, "utf8")
    .digest("hex");
  const canonicalPath = `/estate-sales/linked-organizer-${publicId}`;
  const normalizedAddress = normalizedFullAddress(fixture.normalized);
  const email = testEmail(`public-search-organizer-${suffix}`);
  const user = await prisma.user.create({
    data: {
      displayName: "Public Search Organizer",
      email,
      normalizedEmail: email,
      passwordHash: "integration-test-password-hash",
      emailVerifiedAt: new Date(),
      organizerProfile: { create: { status: "INCOMPLETE" } },
    },
    include: { organizerProfile: true },
  });
  const organizerId = user.organizerProfile!.id;
  const event = await prisma.event.create({
    data: {
      organizerId,
      publicId,
      slug: "linked-organizer",
      title: fixture.content.title,
      description: fixture.content.description,
      eventType: fixture.content.eventType,
      origin: "OWNER_CREATED",
      localStartsAt: fixture.content.localStartsAt,
      localEndsAt: fixture.content.localEndsAt,
      startsAt: new Date(fixture.normalized.startsAt),
      endsAt: new Date(fixture.normalized.endsAt),
      timezone: fixture.content.timezone,
      privacyMode,
      workflowState: "PREVIEW_READY",
    },
  });
  await prisma.$executeRaw`
    INSERT INTO "event_locations" (
      "event_id", "address_line_1", "city", "region", "postal_code",
      "country_code", "normalized_address", "latitude", "longitude",
      "coordinates", "timezone", "provider_place_id", "provider_name",
      "resolution_source", "confirmation_status", "confirmed_by_user_id",
      "confirmed_at", "public_zone", "precision", "confidence",
      "validation_status", "updated_at"
    ) VALUES (
      ${event.id}::uuid,
      ${fixture.content.addressLine1},
      ${fixture.content.city},
      ${fixture.content.region},
      ${fixture.content.postalCode},
      ${fixture.content.countryCode},
      ${normalizedAddress},
      ${latitude},
      ${longitude},
      ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
      ${fixture.content.timezone},
      ${`public-search-${publicId}`},
      'integration-fixture',
      'ORGANIZER_AUTOCOMPLETE',
      'CONFIRMED',
      ${user.id}::uuid,
      CURRENT_TIMESTAMP,
      'bakersfield',
      'exact',
      1,
      'VERIFIED',
      CURRENT_TIMESTAMP
    )
  `;
  const approvedAt = new Date();
  const approval = await prisma.eventApproval.create({
    data: {
      eventId: event.id,
      organizerId,
      acceptedByUserId: user.id,
      contentRevision: 1,
      approvalDigest: digest,
      termsVersion: "public-search-integration-v1",
      termsAcceptedAt: approvedAt,
      approvedAt,
    },
  });
  await prisma.event.update({
    where: { id: event.id },
    data: {
      workflowState: "APPROVED_FOR_PAYMENT",
      approvalStatus: "APPROVED",
      approvedRevision: 1,
      approvalDigest: digest,
      approvedAt,
      termsVersion: approval.termsVersion,
      termsAcceptedAt: approvedAt,
      termsAcceptedByUserId: user.id,
      currentApprovalId: approval.id,
    },
  });
  const payment = await prisma.paymentAttempt.create({
    data: {
      eventId: event.id,
      organizerId,
      userId: user.id,
      approvalId: approval.id,
      approvedRevision: 1,
      approvedDigest: digest,
      attemptGeneration: 1,
      environment: "test",
      stripeCheckoutSessionId: `cs_test_public_search_${suffix}`,
      stripePriceId: "price_test_public_search",
      expectedAmount: 100,
      expectedCurrency: "usd",
      checkoutState: "COMPLETE",
      paymentState: "PAID",
      fulfillmentState: "FULFILLED",
      expiresAt: new Date(approvedAt.getTime() + 60 * 60 * 1000),
      paidAt: approvedAt,
      fulfilledAt: approvedAt,
    },
  });
  await prisma.eventPublication.create({
    data: {
      eventId: event.id,
      paymentAttemptId: payment.id,
      approvedRevision: 1,
      approvalDigest: digest,
      publicId,
      canonicalPath,
      snapshot: {
        schema: "estate-sales-publication-v1",
        privacyMode,
        projection: {
          title: fixture.content.title,
          description: fixture.content.description,
          eventType: fixture.content.eventType,
          path: canonicalPath,
          startsAt: fixture.normalized.startsAt,
          endsAt: fixture.normalized.endsAt,
          timezone: fixture.content.timezone,
          localStartsAt: fixture.content.localStartsAt,
          localEndsAt: fixture.content.localEndsAt,
          address:
            privacyMode === "HIDDEN_UNTIL_START"
              ? {
                  kind: "EXACT",
                  addressLine1: fixture.content.addressLine1,
                  addressLine2: fixture.content.addressLine2,
                  city: fixture.content.city,
                  region: fixture.content.region,
                  postalCode: fixture.content.postalCode,
                  countryCode: fixture.content.countryCode,
                }
              : {
                  kind: "APPROXIMATE",
                  city: fixture.content.city,
                  region: fixture.content.region,
                  countryCode: fixture.content.countryCode,
                  label: "Bakersfield area",
                },
          organizer: {
            displayName: user.displayName,
            websiteUrl: null,
          },
          coverPhotoUrl: `/media/${event.id}/cover`,
          gallery: [],
        },
      },
      publishedAt: approvedAt,
    },
  });
  return { eventId: event.id, publicId };
}

describe("public search external listings", () => {
  it("returns only currently active published external listings", async () => {
    const fixture = harness.nextFixture("Public Search Active External");
    const approved = await approveExternal(fixture);
    const beforeStart = new Date("2125-05-01T00:00:00.000Z");

    const active = await search.search(criteria, beforeStart);
    expect(
      active.items.find(
        (item) => item.resultKey === `external:${approved.publicId}`,
      ),
    ).toMatchObject({
      id: approved.publicId,
      sourceKind: "EXTERNAL",
      sourceLabel: "Fixture",
      unclaimed: true,
      coverPhotoUrl: "/images/marketplace-hero.webp",
    });

    const afterEnd = new Date(
      new Date(fixture.normalized.endsAt).getTime() + 1,
    );
    const expiredByTime = await search.search(criteria, afterEnd);
    expect(
      expiredByTime.items.some(
        (item) => item.resultKey === `external:${approved.publicId}`,
      ),
    ).toBe(false);

    await harness.reviews.removeExternalListing(
      harness.actor(),
      approved.listingId,
      {
        expectedVersion: approved.listingVersion,
        reason: "Removed to prove the public status predicate.",
        confirmation: "REMOVE",
      },
    );
    const removed = await search.search(criteria, beforeStart);
    expect(
      removed.items.some(
        (item) => item.resultKey === `external:${approved.publicId}`,
      ),
    ).toBe(false);
  });

  it("uses immutable external attribution after the source is renamed", async () => {
    const source = await prisma.listingImportSource.findUniqueOrThrow({
      where: { key: "fixture" },
      select: { id: true, name: true },
    });
    expect(source.name).toBe("Fixture");

    try {
      await prisma.listingImportSource.update({
        where: { id: source.id },
        data: { name: "Snapshotted Directory Name" },
      });
      const fixture = harness.nextFixture("Immutable Search Attribution", {
        calendarDate: "2125-07-01",
      });
      const candidate = await harness.createCandidate(fixture);
      const confirmed = await harness.confirmCandidate(candidate.candidateId);
      const approved = await harness.reviews.approveCandidate(
        harness.actor(),
        candidate.candidateId,
        { expectedVersion: confirmed.version },
      );

      await prisma.listingImportSource.update({
        where: { id: source.id },
        data: { name: "Mutable Source Name After Publication" },
      });

      const page = await search.search(
        {
          ...criteria,
          date: "custom",
          from: "2125-07-01",
          to: "2125-07-01",
        },
        new Date("2125-06-30T00:00:00.000Z"),
      );
      expect(
        page.items.find(
          (item) => item.resultKey === `external:${approved.publicId}`,
        ),
      ).toMatchObject({
        sourceKind: "EXTERNAL",
        sourceLabel: "Snapshotted Directory Name",
        unclaimed: true,
      });
    } finally {
      await prisma.listingImportSource.update({
        where: { id: source.id },
        data: { name: source.name },
      });
    }
  });

  it("returns one organizer result after an imported source is linked", async () => {
    const fixture = harness.nextFixture("Public Search Linked Source");
    const organizer = await createPaidOrganizerPublication(fixture);
    const candidate = await harness.createCandidate(fixture);
    const confirmed = await harness.confirmCandidate(candidate.candidateId);
    const match = await prisma.listingDuplicateMatch.findFirstOrThrow({
      where: {
        candidateId: candidate.candidateId,
        eventId: organizer.eventId,
      },
      select: { id: true },
    });
    await harness.reviews.resolveCandidateDuplicate(
      harness.actor(),
      candidate.candidateId,
      match.id,
      {
        expectedVersion: confirmed.version,
        resolution: "LINKED",
      },
    );

    const page = await search.search(
      criteria,
      new Date("2125-05-01T00:00:00.000Z"),
    );
    expect(page.items.filter((item) => item.id === organizer.publicId)).toEqual(
      [
        expect.objectContaining({
          sourceKind: "ORGANIZER",
          resultKey: `event:${organizer.publicId}`,
          sourceLabel: null,
          unclaimed: false,
        }),
      ],
    );
    await expect(
      prisma.externalListing.count({
        where: { candidateId: candidate.candidateId },
      }),
    ).resolves.toBe(0);
  });

  it("pages identical-start mixed results through the emitted v2 cursor", async () => {
    const calendarDate = "2125-06-01";
    const externalFixture = harness.nextFixture("Mixed Tie External", {
      calendarDate,
    });
    const external = await approveExternal(externalFixture);
    const organizerFixture = harness.nextFixture("Mixed Tie Organizer", {
      calendarDate,
    });
    const organizer = await createPaidOrganizerPublication(organizerFixture);
    const tieCriteria: PublicSearchCriteria = {
      ...criteria,
      date: "custom",
      from: calendarDate,
      to: calendarDate,
    };

    const first = await search.search(
      tieCriteria,
      new Date("2125-05-30T00:00:00.000Z"),
      1,
    );
    expect(first.items.map((item) => item.resultKey)).toEqual([
      `external:${external.publicId}`,
    ]);
    expect(first.pageInfo).toMatchObject({
      hasNext: true,
      nextCursor: expect.any(String),
    });

    const second = await search.search(
      { ...tieCriteria, cursor: first.pageInfo.nextCursor },
      new Date("2125-05-30T00:00:00.000Z"),
      1,
    );
    expect(second.items.map((item) => item.resultKey)).toEqual([
      `event:${organizer.publicId}`,
    ]);
    expect(second.pageInfo).toEqual({ hasNext: false, nextCursor: null });
  });

  it("uses exact external coordinates for bounds after hidden-address release", async () => {
    const fixture = harness.nextFixture("Released Hidden Bounds", {
      calendarDate: "2125-08-01",
    });
    const candidate = await harness.createCandidate(fixture);
    const reviews = harness.createReviewService({
      locationProvider: new ReleasedHiddenLocationProvider(),
    });
    const confirmed = await harness.confirmCandidate(
      candidate.candidateId,
      1,
      reviews,
    );
    const approved = await reviews.approveCandidate(
      harness.actor(),
      candidate.candidateId,
      { expectedVersion: confirmed.version },
    );
    // HIDDEN_UNTIL_START remains a persisted compatibility state even though
    // the current review UI authors approximate or exact external locations.
    await prisma.externalListing.update({
      where: { id: approved.listingId },
      data: {
        privacyMode: "HIDDEN_UNTIL_START",
        version: { increment: 1 },
      },
    });
    const boundedCriteria: PublicSearchCriteria = {
      ...criteria,
      view: "map",
      bounds: {
        west: -119.3,
        south: 35.5,
        east: -119.2,
        north: 35.6,
      },
    };
    const startsAt = fixture.normalized.startsAt.getTime();

    const beforeRelease = await search.search(
      boundedCriteria,
      new Date(startsAt - 1),
    );
    expect(
      beforeRelease.items.some(
        (item) => item.resultKey === `external:${approved.publicId}`,
      ),
    ).toBe(false);

    const afterRelease = await search.search(
      boundedCriteria,
      new Date(startsAt + 1),
    );
    expect(
      afterRelease.items.find(
        (item) => item.resultKey === `external:${approved.publicId}`,
      ),
    ).toMatchObject({
      location: { kind: "exact" },
    });
    expect(
      afterRelease.markers?.find(
        (marker) => marker.resultKey === `external:${approved.publicId}`,
      ),
    ).toMatchObject({
      markerKind: "exact",
      geometry: { coordinates: [-119.25, 35.55] },
    });
  });

  it("switches organizer bounds from the protected centroid to exact coordinates at release", async () => {
    const calendarDate = "2125-09-01";
    const fixture = harness.nextFixture("Organizer Hidden Bounds", {
      calendarDate,
    });
    const organizer = await createPaidOrganizerPublication(fixture, {
      coordinates: [-119.25, 35.55],
      privacyMode: "HIDDEN_UNTIL_START",
    });
    const startsAt = fixture.normalized.startsAt.getTime();
    const mapCriteria: PublicSearchCriteria = {
      ...criteria,
      date: "custom",
      from: calendarDate,
      to: calendarDate,
      view: "map",
    };
    const protectedBounds = {
      west: -119.05,
      south: 35.35,
      east: -119,
      north: 35.4,
    };
    const exactBounds = {
      west: -119.3,
      south: 35.5,
      east: -119.2,
      north: 35.6,
    };
    const resultKey = `event:${organizer.publicId}`;

    const beforeReleaseAtProtectedBounds = await search.search(
      { ...mapCriteria, bounds: protectedBounds },
      new Date(startsAt - 1),
    );
    expect(
      beforeReleaseAtProtectedBounds.items.find(
        (item) => item.resultKey === resultKey,
      ),
    ).toMatchObject({ location: { kind: "hidden" } });
    expect(
      beforeReleaseAtProtectedBounds.markers?.find(
        (marker) => marker.resultKey === resultKey,
      ),
    ).toMatchObject({
      markerKind: "hidden",
      geometry: { coordinates: [-119.018712, 35.373292] },
    });

    const beforeReleaseAtExactBounds = await search.search(
      { ...mapCriteria, bounds: exactBounds },
      new Date(startsAt - 1),
    );
    expect(
      beforeReleaseAtExactBounds.items.some(
        (item) => item.resultKey === resultKey,
      ),
    ).toBe(false);

    const afterReleaseAtProtectedBounds = await search.search(
      { ...mapCriteria, bounds: protectedBounds },
      new Date(startsAt + 1),
    );
    expect(
      afterReleaseAtProtectedBounds.items.some(
        (item) => item.resultKey === resultKey,
      ),
    ).toBe(false);

    const afterReleaseAtExactBounds = await search.search(
      { ...mapCriteria, bounds: exactBounds },
      new Date(startsAt + 1),
    );
    expect(
      afterReleaseAtExactBounds.items.find(
        (item) => item.resultKey === resultKey,
      ),
    ).toMatchObject({ location: { kind: "exact" } });
    expect(
      afterReleaseAtExactBounds.markers?.find(
        (marker) => marker.resultKey === resultKey,
      ),
    ).toMatchObject({
      markerKind: "exact",
      geometry: { coordinates: [-119.25, 35.55] },
    });
  });
});
