import { describe, expect, it, vi } from "vitest";

import { MapboxLocationProvider } from "@/modules/locations/infrastructure/mapbox-location-provider";

const input = {
  addressLine1: "123 Main Street",
  addressLine2: null,
  city: "Bakersfield",
  region: "California",
  postalCode: "93301",
  countryCode: "US",
  timezone: "America/Los_Angeles",
};

describe("location provider contract", () => {
  it("maps a Mapbox v6 address into an application-owned DTO", async () => {
    let calledUrl: URL | undefined;
    const request: typeof fetch = async (resource) => {
      calledUrl = new URL(
        typeof resource === "string" || resource instanceof URL
          ? resource
          : resource.url,
      );
      return Response.json({
        features: [
          {
            geometry: { coordinates: [-119.018712, 35.373292] },
            properties: {
              mapbox_id: "dXJuOm1ieGFkcjox",
              feature_type: "address",
              name: "123 Main Street",
              full_address:
                "123 Main Street, Bakersfield, California 93301, United States",
              match_code: { confidence: "exact" },
              context: {
                place: { name: "Bakersfield" },
                region: { name: "California", region_code: "CA" },
                postcode: { name: "93301" },
                country: { country_code: "us" },
              },
            },
          },
        ],
      });
    };
    const result = await new MapboxLocationProvider(
      "test-token",
      request,
    ).validate(input);
    expect(result).toMatchObject({
      providerName: "mapbox",
      providerPlaceId: "dXJuOm1ieGFkcjox",
      latitude: 35.373292,
      longitude: -119.018712,
      timezone: "America/Los_Angeles",
      validationStatus: "VERIFIED",
    });
    expect(calledUrl?.pathname).toBe("/search/geocode/v6/forward");
    expect(calledUrl?.searchParams.get("permanent")).toBe("true");
    expect(calledUrl?.searchParams.get("types")).toBe("address");
    expect(calledUrl?.searchParams.get("limit")).toBe("1");
  });

  it("maps low confidence, no-match, and provider errors safely", async () => {
    const low = new MapboxLocationProvider(
      "test-token",
      vi.fn(async () =>
        Response.json({
          features: [
            {
              geometry: { coordinates: [-119, 35] },
              properties: {
                mapbox_id: "low",
                feature_type: "address",
                name: "Main Street",
                match_code: { confidence: "low" },
              },
            },
          ],
        }),
      ),
    );
    await expect(low.validate(input)).resolves.toMatchObject({
      validationStatus: "LOW_CONFIDENCE",
    });
    await expect(
      new MapboxLocationProvider(
        "test-token",
        vi.fn(async () => Response.json({ features: [] })),
      ).validate(input),
    ).rejects.toThrow(/could not be validated/);
    await expect(
      new MapboxLocationProvider(
        "test-token",
        vi.fn(async () => new Response(null, { status: 429 })),
      ).validate(input),
    ).rejects.toThrow(/rejected/);
  });
});
