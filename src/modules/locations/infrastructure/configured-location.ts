import "server-only";

import { getServerEnvironment } from "@/platform/config/env";

import type { LocationProvider } from "../application/location-provider";
import { LocationProviderError } from "../domain/errors";
import { MapboxLocationProvider } from "./mapbox-location-provider";
import { TestLocationProvider } from "./test-location-provider";

class UnavailableLocationProvider implements LocationProvider {
  async validate(): Promise<never> {
    throw new LocationProviderError("Mapbox is not configured");
  }
}

export function createConfiguredLocationProvider(): LocationProvider {
  const environment = getServerEnvironment();
  if (environment.APP_ENV === "test") {
    if (!environment.TEST_LOCATION_FIXTURES) {
      throw new LocationProviderError(
        "Deterministic location fixtures are not configured",
      );
    }
    return new TestLocationProvider();
  }
  if (!environment.MAPBOX_ACCESS_TOKEN) {
    return new UnavailableLocationProvider();
  }
  return new MapboxLocationProvider(environment.MAPBOX_ACCESS_TOKEN);
}
