export interface PublicSearchCursor {
  readonly startsAt: Date;
  readonly sourceKind: "ORGANIZER" | "EXTERNAL";
  readonly publicId: string;
}

interface PublicSearchSourceRecordBase {
  readonly publicId: string;
  readonly canonicalPath: string;
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  readonly sourceLabel: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly location: {
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly confirmationStatus: "UNCONFIRMED" | "CONFIRMED";
    readonly publicZone: string;
  };
}

export interface OrganizerPublicSearchSourceRecord extends PublicSearchSourceRecordBase {
  readonly sourceKind: "ORGANIZER";
  readonly sourceLabel: null;
  readonly snapshot: unknown;
}

export interface ExternalPublicSearchSourceRecord extends PublicSearchSourceRecordBase {
  readonly sourceKind: "EXTERNAL";
  readonly sourceLabel: string;
  readonly content: {
    readonly title: string;
    readonly localStartsAt: string;
    readonly localEndsAt: string;
    readonly timezone: string;
    readonly privacyMode:
      "EXACT_ADDRESS" | "APPROXIMATE_LOCATION" | "HIDDEN_UNTIL_START";
    readonly city: string;
    readonly region: string;
    readonly coverPhotoUrl: string | null;
  };
}

export type PublicSearchSourceRecord =
  OrganizerPublicSearchSourceRecord | ExternalPublicSearchSourceRecord;

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
