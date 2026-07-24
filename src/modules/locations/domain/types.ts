export interface LocationInput {
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly timezone: string;
}

export interface ValidatedLocation {
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly normalizedAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly providerPlaceId: string;
  readonly providerName: string;
  readonly precision: string | null;
  readonly confidence: number | null;
  readonly validationStatus: "VERIFIED" | "LOW_CONFIDENCE";
}

export interface AddressSuggestion {
  readonly id: string;
  readonly formattedAddress: string;
  readonly houseNumber: string;
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
  readonly countryCode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly confidence: number | null;
  readonly matchType: string | null;
  readonly provider: {
    readonly name: "geoapify" | "test-fixture";
    readonly version: string;
    readonly attribution: string;
  };
}

export interface ConfirmedLocationSelection extends AddressSuggestion {
  readonly confirmed: true;
}
