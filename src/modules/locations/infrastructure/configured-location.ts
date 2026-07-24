import "server-only";

import { getServerEnvironment } from "@/platform/config/env";

import type { LocationProvider } from "../application/location-provider";
import type { AddressAutocompleteProvider } from "../application/address-autocomplete-provider";
import { LocationProviderError } from "../domain/errors";
import { GeoapifyLocationProvider } from "./geoapify-location-provider";
import { TestLocationProvider } from "./test-location-provider";

class UnavailableLocationProvider
  implements LocationProvider, AddressAutocompleteProvider
{
  async validate(): Promise<never> {
    throw new LocationProviderError("Geoapify is not configured");
  }

  async autocomplete(): Promise<never> {
    throw new LocationProviderError("Geoapify is not configured");
  }
}

export function createConfiguredLocationProvider(): LocationProvider &
  AddressAutocompleteProvider {
  const environment = getServerEnvironment();
  if (environment.APP_ENV === "test") {
    if (!environment.TEST_LOCATION_FIXTURES) {
      throw new LocationProviderError(
        "Deterministic location fixtures are not configured",
      );
    }
    return new TestLocationProvider();
  }
  if (!environment.GEOAPIFY_API_KEY) {
    return new UnavailableLocationProvider();
  }
  return new GeoapifyLocationProvider(environment.GEOAPIFY_API_KEY);
}
