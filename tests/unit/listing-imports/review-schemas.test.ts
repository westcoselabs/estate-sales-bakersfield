import { describe, expect, it } from "vitest";

import {
  candidateEditSchema,
  normalizeReviewedListingContent,
  reviewedCandidatePayloadSchema,
  reviewedPayloadWithContent,
} from "@/modules/listing-imports/application/review-schemas";

const digest = "a".repeat(64);

function candidateEdit(overrides: Record<string, unknown> = {}) {
  return {
    expectedVersion: 3,
    eventType: "ESTATE_SALE",
    title: "  Bakersfield   Estate Sale  ",
    description:
      "  Furniture, tools, artwork, and household goods are available.  ",
    localStartsAt: "2026-08-08T09:00",
    localEndsAt: "2026-08-08T15:00",
    timezone: "America/Los_Angeles",
    addressLine1: " 123 Main Street ",
    addressLine2: null,
    city: " Bakersfield ",
    region: " CA ",
    postalCode: " 93301 ",
    countryCode: "us",
    privacyMode: "APPROXIMATE_LOCATION",
    ...overrides,
  };
}

function currentPayload() {
  return reviewedCandidatePayloadSchema.parse({
    sourceListingId: "fixture-100",
    sourceUrl: "https://fixture.invalid/listings/fixture-100",
    retrievedAt: "2026-08-04T12:00:00.000Z",
    contentHash: digest,
    eventType: "ESTATE_SALE",
    title: "Original Estate Sale",
    description:
      "Furniture, tools, artwork, and household goods are available.",
    localStartsAt: "2026-08-08T09:00",
    localEndsAt: "2026-08-08T15:00",
    startsAt: "2026-08-08T16:00:00.000Z",
    endsAt: "2026-08-08T22:00:00.000Z",
    timezone: "America/Los_Angeles",
    addressLine1: "123 Main Street",
    addressLine2: null,
    city: "Bakersfield",
    region: "CA",
    postalCode: "93301",
    countryCode: "US",
    privacyMode: "APPROXIMATE_LOCATION",
    normalizedTitle: "original estate sale",
    normalizedAddress: "123 main street bakersfield ca 93301 us",
    normalizedCity: "bakersfield",
    normalizedPostalCode: "93301",
  });
}

describe("listing import review schemas", () => {
  it("normalizes reviewed content and derives the authoritative schedule", () => {
    const parsed = candidateEditSchema.parse(candidateEdit());
    const { expectedVersion, ...input } = parsed;
    expect(expectedVersion).toBe(3);
    const normalized = normalizeReviewedListingContent(input);

    expect(normalized).toMatchObject({
      title: "Bakersfield Estate Sale",
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      normalizedTitle: "bakersfield estate sale",
      normalizedAddress: "123 main street bakersfield ca 93301 us",
      startsAt: new Date("2026-08-08T16:00:00.000Z"),
      endsAt: new Date("2026-08-08T22:00:00.000Z"),
    });
  });

  it("preserves flat provenance keys while replacing only reviewed fields", () => {
    const current = currentPayload();
    const parsed = candidateEditSchema.parse(candidateEdit());
    const { expectedVersion, ...input } = parsed;
    expect(expectedVersion).toBe(3);
    const next = reviewedPayloadWithContent(
      current,
      normalizeReviewedListingContent(input),
      {
        precision: "building",
        confidence: 0.98,
        validationStatus: "VERIFIED",
      },
    );

    expect(next).toMatchObject({
      sourceListingId: current.sourceListingId,
      sourceUrl: current.sourceUrl,
      retrievedAt: current.retrievedAt,
      contentHash: current.contentHash,
      title: "Bakersfield Estate Sale",
      locationResolution: {
        precision: "building",
        confidence: 0.98,
        validationStatus: "VERIFIED",
      },
    });
    expect(next).not.toHaveProperty("provenance");
    expect(Object.keys(next)).toContain("sourceListingId");
  });

  it("rejects unbounded or structurally unexpected review input", () => {
    expect(() =>
      candidateEditSchema.parse(candidateEdit({ unexpected: "hidden" })),
    ).toThrow();
    expect(() =>
      candidateEditSchema.parse(candidateEdit({ expectedVersion: 0 })),
    ).toThrow();
    expect(() =>
      candidateEditSchema.parse(candidateEdit({ countryCode: "USA" })),
    ).toThrow();
  });

  it("rejects reviewed schedules longer than the bounded fourteen-day scope", () => {
    const parsed = candidateEditSchema.parse(
      candidateEdit({ localEndsAt: "2026-08-23T09:01" }),
    );
    const { expectedVersion, ...input } = parsed;
    expect(expectedVersion).toBe(3);
    expect(() => normalizeReviewedListingContent(input)).toThrow(
      "LISTING_REVIEW_SCHEDULE_TOO_LONG",
    );
  });
});
