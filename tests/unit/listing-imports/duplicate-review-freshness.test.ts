import { describe, expect, it } from "vitest";

import { duplicateReviewContentDigest } from "@/modules/listing-imports/application/duplicate-review-freshness";

const fingerprint = {
  title: "Bakersfield Estate Sale",
  addressLine1: "123 Main Street",
  addressLine2: null,
  city: "Bakersfield",
  region: "CA",
  postalCode: "93301",
  countryCode: "US",
  localStartsAt: "2028-01-10T09:00",
  localEndsAt: "2028-01-10T15:00",
  startsAt: "2028-01-10T17:00:00.000Z",
  endsAt: "2028-01-10T23:00:00.000Z",
  timezone: "America/Los_Angeles",
  normalizedTitle: "bakersfield estate sale",
  normalizedAddress: "123 main street bakersfield ca 93301 us",
  normalizedCity: "bakersfield",
  normalizedPostalCode: "93301",
  locationConfirmationStatus: "CONFIRMED",
  latitude: "35.373292",
  longitude: "-119.018712",
} as const;

describe("duplicate review content freshness", () => {
  it.each([
    ["title", { title: "Revised Bakersfield Estate Sale" }],
    ["address", { addressLine1: "456 Oak Avenue" }],
    ["city", { city: "Shafter" }],
    ["postal code", { postalCode: "93263" }],
    ["schedule", { localEndsAt: "2028-01-10T16:00" }],
    ["schedule instant", { endsAt: "2028-01-11T00:00:00.000Z" }],
    ["normalized address", { normalizedAddress: "123 main st 93301 us" }],
    ["confirmation state", { locationConfirmationStatus: "UNCONFIRMED" }],
    ["latitude", { latitude: "35.400000" }],
    ["longitude", { longitude: "-119.100000" }],
  ])("changes when material %s content changes", (_label, change) => {
    expect(
      duplicateReviewContentDigest({ ...fingerprint, ...change }),
    ).not.toBe(duplicateReviewContentDigest(fingerprint));
  });

  it("is deterministic for the same duplicate-affecting content", () => {
    expect(duplicateReviewContentDigest({ ...fingerprint })).toBe(
      duplicateReviewContentDigest(fingerprint),
    );
  });
});
