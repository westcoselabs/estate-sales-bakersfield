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
