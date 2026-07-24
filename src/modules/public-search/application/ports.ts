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
  }): Promise<readonly PublicSearchSourceRecord[]>;
}
