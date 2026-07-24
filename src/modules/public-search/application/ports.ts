export interface PublicSearchCursor {
  readonly startsAt: Date;
  readonly publicId: string;
}

export interface PublicSearchSourceRecord {
  readonly publicId: string;
  readonly canonicalPath: string;
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly snapshot: unknown;
  readonly location: {
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly confirmationStatus: "UNCONFIRMED" | "CONFIRMED";
    readonly publicZone: string;
  };
}

export interface PublicSearchRepository {
  search(input: {
    readonly eventType: "ESTATE_SALE" | "YARD_SALE" | null;
    readonly location: {
      readonly city: "Bakersfield";
      readonly region: "CA";
    };
    readonly activeAfter: Date;
    readonly range: {
      readonly startsAt: Date;
      readonly endsAt: Date;
    } | null;
    readonly cursor: PublicSearchCursor | null;
    readonly limit: number;
    readonly bounds: PublicMapBounds | null;
  }): Promise<readonly PublicSearchSourceRecord[]>;
}
import type { PublicMapBounds } from "../domain/types";
