import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishedListing } from "@/modules/payments";

const mocks = vi.hoisted(() => ({
  findExternal: vi.fn(),
  publishedOrganizer: vi.fn(),
}));

vi.mock("@/modules/payments", () => ({
  createConfiguredPaymentService: () => ({
    published: mocks.publishedOrganizer,
  }),
}));

vi.mock("@/platform/database/client", () => ({
  getPrismaClient: () => ({
    externalListing: { findFirst: mocks.findExternal },
  }),
}));

import {
  EXTERNAL_LISTING_PLACEHOLDER,
  loadPublishedListing,
} from "@/app/_components/published-listing-loader";

const PUBLIC_ID = "abc123def456";
const NOW = new Date("2026-08-08T18:00:00.000Z");
const SOURCE_URL = "https://fixture.invalid/listings/detail-1";

function organizerListing(): PublishedListing {
  return {
    eventId: "10000000-0000-4000-8000-000000000001",
    approvedRevision: 4,
    canonicalPath: `/estate-sales/organizer-sale-${PUBLIC_ID}`,
    publishedAt: new Date("2026-08-01T18:00:00.000Z"),
    verifiedEmail: "organizer@example.com",
    projection: {
      title: "Organizer sale",
      description:
        "An organizer-created sale with furniture, art, and household goods.",
      eventType: "ESTATE_SALE",
      path: `/estate-sales/organizer-sale-${PUBLIC_ID}`,
      startsAt: "2026-08-10T16:00:00.000Z",
      endsAt: "2026-08-11T23:00:00.000Z",
      timezone: "America/Los_Angeles",
      localStartsAt: "2026-08-10T09:00",
      localEndsAt: "2026-08-11T16:00",
      address: {
        kind: "EXACT",
        addressLine1: "123 Main Street",
        addressLine2: null,
        city: "Bakersfield",
        region: "CA",
        postalCode: "93301",
        countryCode: "US",
      },
      organizer: {
        displayName: "Organizer Sales",
        websiteUrl: "https://organizer.example.com/",
        contactEmail: "organizer@example.com",
      },
      coverPhotoUrl: "/media/photo-1/cover",
      gallery: [{ id: "photo-1", url: "/media/photo-1/gallery", position: 0 }],
    },
  };
}

function externalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    publicId: PUBLIC_ID,
    slug: "external-sale",
    canonicalPath: `/estate-sales/external-sale-${PUBLIC_ID}`,
    eventType: "ESTATE_SALE",
    title: "External sale",
    description:
      "An imported estate sale with furniture, books, and useful household items.",
    localStartsAt: "2026-08-10T09:00",
    localEndsAt: "2026-08-11T16:00",
    startsAt: new Date("2026-08-10T16:00:00.000Z"),
    endsAt: new Date("2026-08-11T23:00:00.000Z"),
    timezone: "America/Los_Angeles",
    privacyMode: "APPROXIMATE_LOCATION",
    status: "PUBLISHED",
    attribution: {
      schema: "external-listing-attribution.v1",
      sourceId: "30000000-0000-4000-8000-000000000001",
      sourceKey: "fixture",
      sourceName: "Fixture Source",
      sourceListingId: "detail-1",
      sourceUrl: SOURCE_URL,
    },
    publishedAt: new Date("2026-08-01T18:00:00.000Z"),
    location: {
      addressLine1: "456 External Avenue",
      addressLine2: null,
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      confirmationStatus: "CONFIRMED",
    },
    primarySourceRecord: {
      sourceListingId: "detail-1",
      canonicalSourceUrl: SOURCE_URL,
      source: {
        id: "30000000-0000-4000-8000-000000000001",
        key: "fixture",
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  mocks.findExternal.mockReset().mockResolvedValue(null);
  mocks.publishedOrganizer.mockReset().mockResolvedValue(null);
});

describe("published listing detail loader", () => {
  it("keeps the organizer publication projection unchanged behind its discriminator", async () => {
    const organizer = organizerListing();
    mocks.publishedOrganizer.mockResolvedValue(organizer);

    const result = await loadPublishedListing(
      "ESTATE_SALE",
      `organizer-sale-${PUBLIC_ID}`,
      NOW,
    );

    expect(result).toEqual({ ...organizer, sourceKind: "ORGANIZER" });
  });

  it("loads only active, confirmed external listings with snapshot attribution", async () => {
    mocks.findExternal.mockResolvedValue(externalRow());

    const result = await loadPublishedListing(
      "ESTATE_SALE",
      `external-sale-${PUBLIC_ID}`,
      NOW,
    );

    expect(mocks.findExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicId: PUBLIC_ID,
          status: "PUBLISHED",
          endsAt: { gt: NOW },
        },
      }),
    );
    expect(result).toMatchObject({
      sourceKind: "EXTERNAL",
      listingId: "20000000-0000-4000-8000-000000000001",
      canonicalPath: `/estate-sales/external-sale-${PUBLIC_ID}`,
      sourceLabel: "Fixture Source",
      sourceUrl: SOURCE_URL,
      projection: {
        coverPhotoUrl: EXTERNAL_LISTING_PLACEHOLDER,
        gallery: [],
        address: {
          kind: "APPROXIMATE",
          label: "Near Bakersfield, CA",
        },
      },
    });
    expect(result?.projection).not.toHaveProperty("organizer");
  });

  it.each(["EXPIRED", "REMOVED"])(
    "fails closed for an external listing whose lifecycle is %s",
    async (status) => {
      mocks.findExternal.mockResolvedValue(externalRow({ status }));

      await expect(
        loadPublishedListing("ESTATE_SALE", `external-sale-${PUBLIC_ID}`, NOW),
      ).resolves.toBeNull();
    },
  );

  it("independently suppresses a published external listing after its end time", async () => {
    mocks.findExternal.mockResolvedValue(
      externalRow({ endsAt: new Date("2026-08-08T18:00:00.000Z") }),
    );

    await expect(
      loadPublishedListing("ESTATE_SALE", `external-sale-${PUBLIC_ID}`, NOW),
    ).resolves.toBeNull();
  });

  it("uses an exact canonical path to distinguish defensive cross-table ID collisions", async () => {
    mocks.publishedOrganizer.mockResolvedValue(organizerListing());
    mocks.findExternal.mockResolvedValue(externalRow());

    await expect(
      loadPublishedListing("ESTATE_SALE", `external-sale-${PUBLIC_ID}`, NOW),
    ).resolves.toMatchObject({ sourceKind: "EXTERNAL" });
    await expect(
      loadPublishedListing("ESTATE_SALE", `organizer-sale-${PUBLIC_ID}`, NOW),
    ).resolves.toMatchObject({ sourceKind: "ORGANIZER" });
    await expect(
      loadPublishedListing("ESTATE_SALE", `ambiguous-sale-${PUBLIC_ID}`, NOW),
    ).resolves.toBeNull();
  });

  it("loads the current external canonical target across a category change", async () => {
    mocks.findExternal.mockResolvedValue(
      externalRow({
        eventType: "YARD_SALE",
        slug: "external-yard-sale",
        canonicalPath: `/yard-sales/external-yard-sale-${PUBLIC_ID}`,
      }),
    );

    await expect(
      loadPublishedListing("ESTATE_SALE", `external-sale-${PUBLIC_ID}`, NOW),
    ).resolves.toMatchObject({
      sourceKind: "EXTERNAL",
      canonicalPath: `/yard-sales/external-yard-sale-${PUBLIC_ID}`,
      projection: { eventType: "YARD_SALE" },
    });
  });

  it("rejects malformed or mutable provenance instead of reflecting it publicly", async () => {
    mocks.findExternal.mockResolvedValue(
      externalRow({
        attribution: {
          schema: "external-listing-attribution.v1",
          sourceId: "30000000-0000-4000-8000-000000000001",
          sourceKey: "fixture",
          sourceName: "Fixture Source",
          sourceListingId: "detail-1",
          sourceUrl: "https://user:secret@fixture.invalid/listings/detail-1",
        },
      }),
    );

    await expect(
      loadPublishedListing("ESTATE_SALE", `external-sale-${PUBLIC_ID}`, NOW),
    ).resolves.toBeNull();
  });

  it("does no database or payment work for an invalid canonical segment", async () => {
    await expect(
      loadPublishedListing("ESTATE_SALE", "not-a-listing", NOW),
    ).resolves.toBeNull();
    expect(mocks.findExternal).not.toHaveBeenCalled();
    expect(mocks.publishedOrganizer).not.toHaveBeenCalled();
  });
});
