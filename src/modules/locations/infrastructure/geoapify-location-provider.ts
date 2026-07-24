import "server-only";

import type { AddressAutocompleteProvider } from "../application/address-autocomplete-provider";
import type { LocationProvider } from "../application/location-provider";
import { LocationNotFoundError, LocationProviderError } from "../domain/errors";
import type {
  AddressSuggestion,
  LocationInput,
  ValidatedLocation,
} from "../domain/types";

interface GeoapifyResult {
  readonly place_id?: string;
  readonly formatted?: string;
  readonly housenumber?: string;
  readonly street?: string;
  readonly city?: string;
  readonly town?: string;
  readonly village?: string;
  readonly state?: string;
  readonly state_code?: string;
  readonly postcode?: string;
  readonly country?: string;
  readonly country_code?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly result_type?: string;
  readonly rank?: {
    readonly confidence?: number;
    readonly match_type?: string;
  };
}

interface GeoapifyResponse {
  readonly results?: readonly GeoapifyResult[];
}

export const BAKERSFIELD_SERVICE_BOUNDS = {
  west: -119.45,
  south: 35.05,
  east: -118.65,
  north: 35.75,
} as const;

export const BAKERSFIELD_CENTER = {
  longitude: -119.018_712,
  latitude: 35.373_292,
} as const;

const GEOAPIFY_VERSION = "v1";
const GEOAPIFY_ATTRIBUTION =
  "Geoapify; address data © OpenStreetMap contributors";
const MINIMUM_QUERY_LENGTH = 4;
const MAXIMUM_SUGGESTIONS = 6;

function isInsideServiceArea(latitude: number, longitude: number): boolean {
  return (
    longitude >= BAKERSFIELD_SERVICE_BOUNDS.west &&
    longitude <= BAKERSFIELD_SERVICE_BOUNDS.east &&
    latitude >= BAKERSFIELD_SERVICE_BOUNDS.south &&
    latitude <= BAKERSFIELD_SERVICE_BOUNDS.north
  );
}

function normalizedSuggestion(
  result: GeoapifyResult,
): AddressSuggestion | null {
  const city = result.city ?? result.town ?? result.village;
  if (
    !result.place_id ||
    !result.formatted ||
    !result.housenumber ||
    !result.street ||
    !city ||
    !result.state ||
    !result.postcode ||
    !result.country ||
    result.country_code?.toLowerCase() !== "us" ||
    !Number.isFinite(result.lat) ||
    !Number.isFinite(result.lon) ||
    !isInsideServiceArea(result.lat!, result.lon!)
  ) {
    return null;
  }
  return {
    id: result.place_id,
    formattedAddress: result.formatted,
    houseNumber: result.housenumber,
    street: result.street,
    city,
    state: result.state_code ?? result.state,
    postalCode: result.postcode,
    country: result.country,
    countryCode: "US",
    latitude: result.lat!,
    longitude: result.lon!,
    confidence:
      typeof result.rank?.confidence === "number"
        ? result.rank.confidence
        : null,
    matchType: result.rank?.match_type ?? result.result_type ?? null,
    provider: {
      name: "geoapify",
      version: GEOAPIFY_VERSION,
      attribution: GEOAPIFY_ATTRIBUTION,
    },
  };
}

export class GeoapifyLocationProvider
  implements AddressAutocompleteProvider, LocationProvider
{
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new LocationProviderError("Geoapify is not configured");
  }

  async autocomplete(query: string): Promise<readonly AddressSuggestion[]> {
    const text = query.trim();
    if (text.length < MINIMUM_QUERY_LENGTH) return [];
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.searchParams.set("text", text);
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", String(MAXIMUM_SUGGESTIONS));
    url.searchParams.set(
      "filter",
      `rect:${BAKERSFIELD_SERVICE_BOUNDS.west},${BAKERSFIELD_SERVICE_BOUNDS.south},${BAKERSFIELD_SERVICE_BOUNDS.east},${BAKERSFIELD_SERVICE_BOUNDS.north}|countrycode:us`,
    );
    url.searchParams.set(
      "bias",
      `proximity:${BAKERSFIELD_CENTER.longitude},${BAKERSFIELD_CENTER.latitude}`,
    );
    url.searchParams.set("apiKey", this.apiKey);

    const payload = await this.fetch(url);
    return (payload.results ?? [])
      .map(normalizedSuggestion)
      .filter((result): result is AddressSuggestion => result !== null)
      .slice(0, MAXIMUM_SUGGESTIONS);
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
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.searchParams.set("text", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", "1");
    url.searchParams.set("filter", "countrycode:us");
    url.searchParams.set(
      "bias",
      `proximity:${BAKERSFIELD_CENTER.longitude},${BAKERSFIELD_CENTER.latitude}`,
    );
    url.searchParams.set("apiKey", this.apiKey);

    const result = normalizedSuggestion(
      (await this.fetch(url)).results?.[0] ?? {},
    );
    if (!result) {
      throw new LocationNotFoundError("The address could not be resolved");
    }
    return {
      addressLine1: `${result.houseNumber} ${result.street}`,
      addressLine2: input.addressLine2,
      city: result.city,
      region: result.state,
      postalCode: result.postalCode,
      countryCode: result.countryCode,
      normalizedAddress: result.formattedAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: input.timezone,
      providerPlaceId: result.id,
      providerName: result.provider.name,
      precision: result.matchType,
      confidence: result.confidence,
      validationStatus:
        (result.confidence ?? 0) >= 0.9 ? "VERIFIED" : "LOW_CONFIDENCE",
    };
  }

  private async fetch(url: URL): Promise<GeoapifyResponse> {
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
        "The location provider rejected the request",
      );
    }
    try {
      return (await response.json()) as GeoapifyResponse;
    } catch (cause) {
      throw new LocationProviderError(
        "The location provider returned invalid data",
        {
          cause,
        },
      );
    }
  }
}
