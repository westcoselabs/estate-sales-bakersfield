import type {
  PublicDateFilter,
  PublicSearchCriteria,
  PublicSearchIssue,
} from "../domain/types";

export type PublicSearchRawQuery = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export type PublicSearchQueryParameters =
  PublicSearchRawQuery | URLSearchParams;

export interface NormalizedPublicSearch {
  readonly criteria: PublicSearchCriteria;
  readonly issue: PublicSearchIssue | null;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CURSOR = /^[A-Za-z0-9_-]{8,500}$/;

function first(value: string | readonly string[] | undefined): string {
  if (typeof value === "string") return value;
  return value?.[0] ?? "";
}

/**
 * Converts URLSearchParams to the same first-value representation supplied by
 * Next's server-side searchParams prop. Keeping this at the boundary makes
 * duplicate keys deterministic across the API and server-rendered search.
 */
export function publicSearchRawQueryFromUrlSearchParams(
  parameters: URLSearchParams,
): PublicSearchRawQuery {
  const raw: Record<string, string> = {};
  parameters.forEach((value, key) => {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) raw[key] = value;
  });
  return raw;
}

export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function normalizedDate(value: string): PublicDateFilter {
  return ["today", "weekend", "next-7-days", "custom"].includes(value)
    ? (value as PublicDateFilter)
    : "all";
}

export function normalizeSearchQuery(
  parameters: PublicSearchQueryParameters,
): NormalizedPublicSearch {
  const raw =
    parameters instanceof URLSearchParams
      ? publicSearchRawQueryFromUrlSearchParams(parameters)
      : parameters;
  const saleValue = first(raw.sale);
  const date = normalizedDate(first(raw.date));
  const fromValue = first(raw.from);
  const toValue = first(raw.to);
  const from = isCalendarDate(fromValue) ? fromValue : null;
  const to = isCalendarDate(toValue) ? toValue : null;
  const customRangeValid =
    date !== "custom" || Boolean(from && to && from <= to);

  return {
    criteria: {
      sale: saleValue === "estate" || saleValue === "yard" ? saleValue : "all",
      date,
      from,
      to,
      location: "bakersfield-ca",
      sort: "soonest",
      view: first(raw.view) === "map" ? "map" : "list",
      cursor: CURSOR.test(first(raw.cursor)) ? first(raw.cursor) : null,
    },
    issue: customRangeValid
      ? null
      : {
          code: "INVALID_CUSTOM_RANGE",
          message:
            "Choose a valid start and end date. The end date cannot be before the start date.",
        },
  };
}

export function buildSearchHref(
  criteria: PublicSearchCriteria,
  changes: Partial<PublicSearchCriteria> = {},
): string {
  const merged: PublicSearchCriteria = {
    ...criteria,
    ...changes,
    cursor:
      Object.prototype.hasOwnProperty.call(changes, "cursor") &&
      changes.cursor !== undefined
        ? changes.cursor
        : null,
  };
  const parameters = new URLSearchParams();
  if (merged.sale !== "all") parameters.set("sale", merged.sale);
  if (merged.date !== "all") parameters.set("date", merged.date);
  if (merged.date === "custom" && merged.from && merged.to) {
    parameters.set("from", merged.from);
    parameters.set("to", merged.to);
  }
  if (merged.view === "map") parameters.set("view", "map");
  if (merged.cursor) parameters.set("cursor", merged.cursor);
  const query = parameters.toString();
  return query ? `/search?${query}` : "/search";
}

export function activeFilterCount(criteria: PublicSearchCriteria): number {
  return Number(criteria.sale !== "all") + Number(criteria.date !== "all");
}

export function dateFilterLabel(criteria: PublicSearchCriteria): string | null {
  if (criteria.date === "today") return "Today";
  if (criteria.date === "weekend") return "This weekend";
  if (criteria.date === "next-7-days") return "Next 7 days";
  if (criteria.date === "custom" && criteria.from && criteria.to) {
    return criteria.from === criteria.to
      ? criteria.from
      : `${criteria.from} to ${criteria.to}`;
  }
  return null;
}
