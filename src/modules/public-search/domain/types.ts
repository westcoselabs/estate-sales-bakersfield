export type PublicSaleFilter = "all" | "estate" | "yard";
export type PublicDateFilter =
  "all" | "today" | "weekend" | "next-7-days" | "custom";
export type PublicSearchView = "list" | "map";

export interface PublicSearchCriteria {
  readonly sale: PublicSaleFilter;
  readonly date: PublicDateFilter;
  readonly from: string | null;
  readonly to: string | null;
  readonly location: "bakersfield-ca";
  readonly sort: "soonest";
  readonly view: PublicSearchView;
  readonly cursor: string | null;
}

export interface PublicSearchIssue {
  readonly code: "INVALID_CUSTOM_RANGE";
  readonly message: string;
}

export interface PublicListingCardProjection {
  readonly id: string;
  readonly href: string;
  readonly saleType: "estate" | "yard";
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: string;
  readonly location: {
    readonly kind: "exact" | "approximate" | "hidden";
    readonly label: string;
    readonly city: string;
    readonly region: string;
  };
  readonly coverPhotoUrl: string;
}

export interface PublicSearchPage {
  readonly schema: "public-search-v1";
  readonly criteria: PublicSearchCriteria;
  readonly items: readonly PublicListingCardProjection[];
  readonly pageInfo: {
    readonly hasNext: boolean;
    readonly nextCursor: string | null;
  };
}
