import "server-only";

import type { LocationProvider } from "../application/location-provider";
import { LocationNotFoundError, LocationProviderError } from "../domain/errors";
import type { LocationInput, ValidatedLocation } from "../domain/types";

interface MapboxFeature {
  readonly geometry?: { readonly coordinates?: readonly [number, number] };
  readonly properties?: {
    readonly mapbox_id?: string;
    readonly feature_type?: string;
    readonly name?: string;
    readonly full_address?: string;
    readonly match_code?: { readonly confidence?: string };
    readonly context?: {
      readonly place?: { readonly name?: string };
      readonly region?: {
        readonly name?: string;
        readonly region_code?: string;
      };
      readonly postcode?: { readonly name?: string };
      readonly country?: { readonly country_code?: string };
    };
  };
}

interface MapboxResponse {
  readonly features?: readonly MapboxFeature[];
}

function confidenceValue(value: string | undefined): number {
  switch (value) {
    case "exact":
      return 1;
    case "high":
      return 0.95;
    case "medium":
      return 0.7;
    case "low":
      return 0.4;
    default:
      return 0.5;
  }
}

export class MapboxLocationProvider implements LocationProvider {
  constructor(
    private readonly accessToken: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!accessToken)
      throw new LocationProviderError("Mapbox is not configured");
  }

  async validate(input: LocationInput): Promise<ValidatedLocation> {
    const query = [
      input.addressLine1,
      input.addressLine2,
      input.city,
      input.region,
      input.postalCode,
      input.countryCode,
    ]
      .filter(Boolean)
      .join(", ");
    const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
    url.searchParams.set("q", query);
    url.searchParams.set("access_token", this.accessToken);
    url.searchParams.set("permanent", "true");
    url.searchParams.set("autocomplete", "false");
    url.searchParams.set("types", "address");
    url.searchParams.set("country", input.countryCode.toLowerCase());
    url.searchParams.set("limit", "1");

    let response: Response;
    try {
      response = await this.request(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (cause) {
      throw new LocationProviderError("The location provider is unavailable", {
        cause,
      });
    }
    if (!response.ok) {
      throw new LocationProviderError(
        `The location provider rejected the request (${String(response.status)})`,
      );
    }
    const payload = (await response.json()) as MapboxResponse;
    const feature = payload.features?.[0];
    const properties = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (
      !feature ||
      properties?.feature_type !== "address" ||
      !properties.mapbox_id ||
      !properties.name ||
      !coordinates ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1])
    ) {
      throw new LocationNotFoundError("The address could not be validated");
    }
    const confidence = confidenceValue(properties.match_code?.confidence);
    return {
      addressLine1: properties.name,
      addressLine2: input.addressLine2,
      city: properties.context?.place?.name ?? input.city,
      region:
        properties.context?.region?.region_code ??
        properties.context?.region?.name ??
        input.region,
      postalCode: properties.context?.postcode?.name ?? input.postalCode,
      countryCode: (
        properties.context?.country?.country_code ?? input.countryCode
      ).toUpperCase(),
      normalizedAddress: properties.full_address ?? query,
      longitude: coordinates[0],
      latitude: coordinates[1],
      timezone: input.timezone,
      providerPlaceId: properties.mapbox_id,
      providerName: "mapbox",
      precision: properties.match_code?.confidence ?? null,
      confidence,
      validationStatus: confidence >= 0.9 ? "VERIFIED" : "LOW_CONFIDENCE",
    };
  }
}
