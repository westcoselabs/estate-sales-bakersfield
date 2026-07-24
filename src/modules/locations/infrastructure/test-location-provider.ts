import "server-only";

import type { LocationProvider } from "../application/location-provider";
import type { AddressAutocompleteProvider } from "../application/address-autocomplete-provider";
import type {
  AddressSuggestion,
  LocationInput,
  ValidatedLocation,
} from "../domain/types";

export class TestLocationProvider
  implements LocationProvider, AddressAutocompleteProvider
{
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

  autocomplete(query: string): Promise<readonly AddressSuggestion[]> {
    if (query.trim().length < 4) return Promise.resolve([]);
    return Promise.resolve([
      {
        id: "test:93301:123-baker-street",
        formattedAddress:
          "123 Baker Street, Bakersfield, CA 93301, United States",
        houseNumber: "123",
        street: "Baker Street",
        city: "Bakersfield",
        state: "CA",
        postalCode: "93301",
        country: "United States",
        countryCode: "US",
        latitude: 35.373_292,
        longitude: -119.018_712,
        confidence: 1,
        matchType: "full_match",
        provider: {
          name: "test-fixture",
          version: "v1",
          attribution: "Deterministic test fixture",
        },
      },
    ]);
  }
}
