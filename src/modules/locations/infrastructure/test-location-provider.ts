import "server-only";

import type { LocationProvider } from "../application/location-provider";
import type { LocationInput, ValidatedLocation } from "../domain/types";

export class TestLocationProvider implements LocationProvider {
  constructor() {
    if (process.env.APP_ENV !== "test") {
      throw new Error("The deterministic location provider is test-only");
    }
  }

  validate(input: LocationInput): Promise<ValidatedLocation> {
    return Promise.resolve({
      ...input,
      normalizedAddress: [
        input.addressLine1,
        input.addressLine2,
        input.city,
        input.region,
        input.postalCode,
        input.countryCode,
      ]
        .filter(Boolean)
        .join(", "),
      latitude: 35.373_292,
      longitude: -119.018_712,
      providerPlaceId: `test:${input.postalCode}:${input.addressLine1.toLowerCase()}`,
      providerName: "test-fixture",
      precision: "exact",
      confidence: 1,
      validationStatus: "VERIFIED",
    });
  }
}
