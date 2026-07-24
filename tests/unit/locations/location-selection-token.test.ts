import { describe, expect, it } from "vitest";

import {
  createLocationSelectionToken,
  verifyLocationSelectionToken,
  type AddressSuggestion,
} from "@/modules/locations";

const suggestion: AddressSuggestion = {
  id: "geoapify-place-123",
  formattedAddress: "123 Main Street, Bakersfield, CA 93301, United States",
  houseNumber: "123",
  street: "Main Street",
  city: "Bakersfield",
  state: "CA",
  postalCode: "93301",
  country: "United States",
  countryCode: "US",
  latitude: 35.373292,
  longitude: -119.018712,
  confidence: 0.99,
  matchType: "full_match",
  provider: {
    name: "geoapify",
    version: "v1",
    attribution: "Geoapify; address data © OpenStreetMap contributors",
  },
};

describe("signed location selections", () => {
  it("round-trips an authoritative provider selection", () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    const token = createLocationSelectionToken(
      suggestion,
      "selection-test-secret-with-32-characters",
      now,
    );

    expect(
      verifyLocationSelectionToken(
        token,
        "selection-test-secret-with-32-characters",
        new Date("2026-07-24T12:29:59.000Z"),
      ),
    ).toEqual(suggestion);
  });

  it("rejects tampering, the wrong secret, and expired selections", () => {
    const issuedAt = new Date("2026-07-24T12:00:00.000Z");
    const secret = "selection-test-secret-with-32-characters";
    const token = createLocationSelectionToken(suggestion, secret, issuedAt);

    expect(() =>
      verifyLocationSelectionToken(`${token}x`, secret, issuedAt),
    ).toThrow(/invalid/);
    expect(() =>
      verifyLocationSelectionToken(
        token,
        "different-selection-secret-32-characters",
        issuedAt,
      ),
    ).toThrow(/invalid/);
    expect(() =>
      verifyLocationSelectionToken(
        token,
        secret,
        new Date("2026-07-24T12:30:01.000Z"),
      ),
    ).toThrow(/expired/);
  });
});
