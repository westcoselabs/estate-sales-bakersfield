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
      latitude: 35.55232,
      longitude: -119.25231,
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
  readonly addressRevealAt?: string;
  readonly scheduleDays?: readonly {
    readonly date: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly startsAt: string;
    readonly endsAt: string;
  }[];
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
        ...(options.addressRevealAt
          ? { addressRevealAt: options.addressRevealAt }
          : {}),
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
          ...(options.scheduleDays
            ? { scheduleDays: [...options.scheduleDays] }
            : {}),
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
  it("matches only selected sale dates and forwards each day's opening and closing hours", async () => {
    const original = harness.nextFixture("Separate Sale Dates", {
      calendarDate: "2125-11-04",
    });
    const fixture = {
      ...original,
      content: {
        ...original.content,
        localStartsAt: "2125-11-04T08:00",
        localEndsAt: "2125-11-06T13:00",
      },
      normalized: {
        ...original.normalized,
        startsAt: new Date("2125-11-04T16:00:00Z"),
        endsAt: new Date("2125-11-06T21:00:00Z"),
      },
    };
    const scheduleDays = [
      {
        date: "2125-11-04",
        startTime: "08:00",
        endTime: "13:00",
        startsAt: "2125-11-04T16:00:00.000Z",
        endsAt: "2125-11-04T21:00:00.000Z",
      },
      {
        date: "2125-11-06",
        startTime: "08:00",
        endTime: "13:00",
        startsAt: "2125-11-06T16:00:00.000Z",
        endsAt: "2125-11-06T21:00:00.000Z",
      },
    ];
    const organizer = await createPaidOrganizerPublication(fixture, {
      scheduleDays,
    });
    const now = new Date("2125-11-03T12:00:00Z");
    for (const day of ["2125-11-04", "2125-11-06"]) {
      const page = await search.search(
        { ...criteria, date: "custom", from: day, to: day },
        now,
      );
      expect(
        page.items.find((item) => item.id === organizer.publicId)?.scheduleDays,
      ).toEqual(scheduleDays);
    }
    const closedDay = await search.search(
      { ...criteria, date: "custom", from: "2125-11-05", to: "2125-11-05" },
      now,
    );
    expect(closedDay.items.some((item) => item.id === organizer.publicId)).toBe(
      false,
    );
  });

  it("derives immutable search fields from publication and advances cache visibility atomically", async () => {
    const fixture = harness.nextFixture("Immutable Search Document", {
      calendarDate: "2125-10-01",
    });
    const organizer = await createPaidOrganizerPublication(fixture);
    const publication = await prisma.eventPublication.findUniqueOrThrow({
      where: { eventId: organizer.eventId },
      include: { searchDocument: true },
    });
    expect(publication.searchDocument).toMatchObject({
      publicationId: publication.id,
      publicId: organizer.publicId,
      eventType: fixture.content.eventType,
      startsAt: fixture.normalized.startsAt,
      endsAt: fixture.normalized.endsAt,
      city: fixture.content.city,
      region: fixture.content.region,
    });
    await expect(
      prisma.publicationSearchDocument.update({
        where: { publicationId: publication.id },
        data: { city: "Elsewhere" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.publicationSearchDocument.delete({
        where: { publicationId: publication.id },
      }),
    ).rejects.toThrow();

    const queryCriteria: PublicSearchCriteria = {
      ...criteria,
      date: "custom",
      from: "2125-10-01",
      to: "2125-10-01",
    };
    const at = new Date("2125-09-30T00:00:00Z");
    expect(
      (await search.search(queryCriteria, at)).items.some(
        (item) => item.id === organizer.publicId,
      ),
    ).toBe(true);
    const [before] = await prisma.$queryRaw<
      { revision: bigint }[]
    >`SELECT "revision" FROM "public_search_revision" WHERE "id" = 1`;
    await prisma.event.update({
      where: { id: organizer.eventId },
      data: {
        canceledAt: new Date(),
        cancellationReason: "Integration visibility check",
      },
    });
    const [after] = await prisma.$queryRaw<
      { revision: bigint }[]
    >`SELECT "revision" FROM "public_search_revision" WHERE "id" = 1`;
    expect(after!.revision).toBeGreaterThan(before!.revision);
    expect(
      (await search.search(queryCriteria, at)).items.some(
        (item) => item.id === organizer.publicId,
      ),
    ).toBe(false);
  });

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
        west: -119.253,
        south: 35.552,
        east: -119.252,
        north: 35.553,
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
      geometry: { coordinates: [-119.25231, 35.55232] },
    });
  });

  it("switches organizer bounds from the protected neighborhood to exact coordinates at the selected release", async () => {
    const calendarDate = "2125-09-01";
    const fixture = harness.nextFixture("Organizer Hidden Bounds", {
      calendarDate,
    });
    const release = new Date(
      fixture.normalized.startsAt.getTime() - 2 * 60 * 60 * 1000,
    );
    const organizer = await createPaidOrganizerPublication(fixture, {
      coordinates: [-119.25231, 35.55232],
      privacyMode: "HIDDEN_UNTIL_START",
      addressRevealAt: release.toISOString(),
    });
    const releasesAt = release.getTime();
    const mapCriteria: PublicSearchCriteria = {
      ...criteria,
      date: "custom",
      from: calendarDate,
      to: calendarDate,
      view: "map",
    };
    const protectedBounds = {
      west: -119.256,
      south: 35.554,
      east: -119.254,
      north: 35.556,
    };
    const exactBounds = {
      west: -119.253,
      south: 35.552,
      east: -119.252,
      north: 35.553,
    };
    const resultKey = `event:${organizer.publicId}`;

    const beforeReleaseAtProtectedBounds = await search.search(
      { ...mapCriteria, bounds: protectedBounds },
      new Date(releasesAt - 1),
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
      geometry: { coordinates: [-119.255, 35.555] },
      approximateRadiusMeters: 750,
    });

    const beforeReleaseAtExactBounds = await search.search(
      { ...mapCriteria, bounds: exactBounds },
      new Date(releasesAt - 1),
    );
    expect(
      beforeReleaseAtExactBounds.items.some(
        (item) => item.resultKey === resultKey,
      ),
    ).toBe(false);

    const afterReleaseAtProtectedBounds = await search.search(
      { ...mapCriteria, bounds: protectedBounds },
      new Date(releasesAt),
    );
    expect(
      afterReleaseAtProtectedBounds.items.some(
        (item) => item.resultKey === resultKey,
      ),
    ).toBe(false);

    const afterReleaseAtExactBounds = await search.search(
      { ...mapCriteria, bounds: exactBounds },
      new Date(releasesAt),
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
      geometry: { coordinates: [-119.25231, 35.55232] },
    });
  });
});
