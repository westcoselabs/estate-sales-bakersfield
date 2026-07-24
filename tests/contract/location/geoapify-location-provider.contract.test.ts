import { describe, expect, it, vi } from "vitest";

import {
  BAKERSFIELD_CENTER,
  BAKERSFIELD_SERVICE_BOUNDS,
  GeoapifyLocationProvider,
} from "@/modules/locations";

const validResult = {
  place_id: "geoapify-place-123",
  formatted: "123 Main Street, Bakersfield, CA 93301, United States",
  housenumber: "123",
  street: "Main Street",
  city: "Bakersfield",
  state: "California",
  state_code: "CA",
  postcode: "93301",
  country: "United States",
  country_code: "us",
  lat: 35.373292,
  lon: -119.018712,
  result_type: "building",
  rank: { confidence: 0.99, match_type: "full_match" },
};

const input = {
  addressLine1: "123 Main Street",
  addressLine2: null,
  city: "Bakersfield",
  region: "CA",
  postalCode: "93301",
  countryCode: "US",
  timezone: "America/Los_Angeles",
} as const;

describe("Geoapify location provider contract", () => {
  it("normalizes autocomplete results and sends bounded US-biased requests", async () => {
    let calledUrl: URL | undefined;
    const request = vi.fn<typeof fetch>(async (resource) => {
      calledUrl = new URL(
        typeof resource === "string" || resource instanceof URL
          ? resource
          : resource.url,
      );
      return Response.json({
        results: [
          validResult,
          { ...validResult, place_id: "outside", lon: -120.5 },
          { ...validResult, place_id: "missing-postcode", postcode: undefined },
        ],
      });
    });
    const provider = new GeoapifyLocationProvider(
      "geoapify-private-test-key",
      request,
    );

    await expect(provider.autocomplete("123 Main")).resolves.toEqual([
      {
        id: "geoapify-place-123",
        formattedAddress:
          "123 Main Street, Bakersfield, CA 93301, United States",
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
      },
    ]);
    expect(calledUrl?.pathname).toBe("/v1/geocode/autocomplete");
    expect(calledUrl?.searchParams.get("limit")).toBe("6");
    expect(calledUrl?.searchParams.get("type")).toBeNull();
    expect(calledUrl?.searchParams.get("filter")).toBe(
      `rect:${BAKERSFIELD_SERVICE_BOUNDS.west},${BAKERSFIELD_SERVICE_BOUNDS.south},${BAKERSFIELD_SERVICE_BOUNDS.east},${BAKERSFIELD_SERVICE_BOUNDS.north}|countrycode:us`,
    );
    expect(calledUrl?.searchParams.get("bias")).toBe(
      `proximity:${BAKERSFIELD_CENTER.longitude},${BAKERSFIELD_CENTER.latitude}`,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("skips short autocomplete queries and maps controlled forward geocoding", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ results: [validResult] }),
    );
    const provider = new GeoapifyLocationProvider(
      "geoapify-private-test-key",
      request,
    );

    await expect(provider.autocomplete("123")).resolves.toEqual([]);
    expect(request).not.toHaveBeenCalled();
    await expect(provider.validate(input)).resolves.toMatchObject({
      providerName: "geoapify",
      providerPlaceId: "geoapify-place-123",
      latitude: 35.373292,
      longitude: -119.018712,
      validationStatus: "VERIFIED",
    });
    const calledUrl = new URL(String(request.mock.calls[0]?.[0]));
    expect(calledUrl.pathname).toBe("/v1/geocode/search");
    expect(calledUrl.searchParams.get("limit")).toBe("1");
    expect(calledUrl.searchParams.get("filter")).toBe("countrycode:us");
    expect(calledUrl.searchParams.get("type")).toBeNull();
  });

  it("uses provider-neutral errors without disclosing the private key", async () => {
    const privateKey = "geoapify-private-test-key";
    const provider = new GeoapifyLocationProvider(
      privateKey,
      vi.fn(async () => new Response(null, { status: 429 })),
    );

    const error = await provider
      .autocomplete("123 Main")
      .catch((cause) => cause);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(privateKey);
    expect(String(error)).toContain("rejected");
  });
});
