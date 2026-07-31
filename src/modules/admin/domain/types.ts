export type AdminDateRangeKey = "today" | "7d" | "30d" | "year" | "all";

export interface AdminDateRange {
  key: AdminDateRangeKey;
  label: string;
  from: Date | null;
  to: Date;
  bucket: "hour" | "day" | "month";
}

export interface MoneyTotal {
  currency: string;
  amount: number;
  count: number;
  average: number;
}

export interface AdminOverview {
  range: AdminDateRange;
  metrics: {
    totalUsers: number;
    newUsers: number;
    activeListings: number;
    publishedListings: number;
    canceledListings: number;
    successfulPurchases: number;
    grossRevenue: MoneyTotal[];
  };
  trend: Array<{ key: string; label: string; amount: number; count: number }>;
  funnel: Array<{ label: string; count: number; conversion: number | null }>;
  activity: Array<{
    key: string;
    label: string;
    occurredAt: Date;
    href: string | null;
  }>;
  warnings: Array<{ label: string; count: number }>;
  applicationCurrency: string;
}

export type AdminUserFilter =
  "all" | "verified" | "unverified" | "published" | "restricted";

export type AdminListingFilter =
  | "active"
  | "drafts"
  | "published"
  | "ended"
  | "canceled"
  | "deleted"
  | "removed";

export interface AdminCursor {
  at: Date;
  id: string;
}
