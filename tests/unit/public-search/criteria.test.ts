import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  buildSearchHref,
  dateFilterLabel,
  isCalendarDate,
  normalizeSearchQuery,
  publicSearchRawQueryFromUrlSearchParams,
} from "@/modules/public-search/application/criteria";
import type { PublicSearchCriteria } from "@/modules/public-search/domain/types";

const defaults: PublicSearchCriteria = {
  sale: "all",
  date: "all",
  from: null,
  to: null,
  location: "bakersfield-ca",
  sort: "soonest",
  view: "list",
  cursor: null,
  bounds: null,
};

describe("public search query criteria", () => {
  it("normalizes supported public filters and rejects unsupported keys", () => {
    expect(
      normalizeSearchQuery({
        sale: "estate",
        date: "weekend",
        view: "map",
      }),
    ).toEqual({
      criteria: {
        ...defaults,
        sale: "estate",
        date: "weekend",
        view: "map",
      },
      issue: null,
    });

    expect(
      normalizeSearchQuery({
        sale: "estate",
        date: "weekend",
        view: "map",
        location: "fresno-ca",
        sort: "price",
        category: "antiques",
      }),
    ).toEqual({
      criteria: defaults,
      issue: {
        code: "INVALID_PARAMETERS",
        message: "The search contains unsupported or repeated parameters.",
      },
    });
  });

  it("rejects repeated and malformed input deterministically", () => {
    expect(
      normalizeSearchQuery({
        sale: ["yard", "estate"],
        date: ["tomorrow", "today"],
        view: ["grid", "map"],
        cursor: "not valid!",
      }),
    ).toEqual({
      criteria: defaults,
      issue: {
        code: "INVALID_PARAMETERS",
        message: "The search contains unsupported or repeated parameters.",
      },
    });
  });

  it("adapts URLSearchParams with the same first-value semantics as SSR", () => {
    const parameters = new URLSearchParams(
      "sale=yard&sale=estate&date=tomorrow&date=today&view=grid&view=map",
    );

    expect(publicSearchRawQueryFromUrlSearchParams(parameters)).toEqual({
      sale: "yard",
      date: "tomorrow",
      view: "grid",
    });
    expect(normalizeSearchQuery(parameters)).toEqual(
      normalizeSearchQuery({
        sale: ["yard", "estate"],
        date: ["tomorrow", "today"],
        view: ["grid", "map"],
      }),
    );
  });

  it("accepts real calendar dates and rejects impossible dates", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(isCalendarDate("2026-04-31")).toBe(false);
    expect(isCalendarDate("2026-4-01")).toBe(false);
  });

  it("reports invalid custom ranges without inventing a replacement range", () => {
    const missingEnd = normalizeSearchQuery({
      date: "custom",
      from: "2026-08-01",
    });
    const reversed = normalizeSearchQuery({
      date: "custom",
      from: "2026-08-03",
      to: "2026-08-01",
    });

    expect(missingEnd.criteria).toMatchObject({
      date: "custom",
      from: "2026-08-01",
      to: null,
    });
    expect(missingEnd.issue?.code).toBe("INVALID_CUSTOM_RANGE");
    expect(reversed.issue).toEqual({
      code: "INVALID_CUSTOM_RANGE",
      message:
        "Choose a valid start and end date. The end date cannot be before the start date.",
    });
  });

  it("accepts only useful map bounds inside the Bakersfield service area", () => {
    expect(
      normalizeSearchQuery({
        view: "map",
        bounds: "-119.20,35.20,-118.90,35.50",
      }),
    ).toEqual({
      criteria: {
        ...defaults,
        view: "map",
        bounds: {
          west: -119.2,
          south: 35.2,
          east: -118.9,
          north: 35.5,
        },
      },
      issue: null,
    });
    for (const bounds of [
      "-120,35.20,-118.90,35.50",
      "-119.20,35.20,-118.90,36",
      "-119.20,35.20,-119.18,35.50",
      "-119.20,35.20,-118.90,35.21",
      "not,bounds",
    ]) {
      expect(normalizeSearchQuery({ view: "map", bounds }).issue?.code).toBe(
        "INVALID_MAP_BOUNDS",
      );
    }
  });

  it("creates canonical, shareable hrefs and resets pagination after a filter change", () => {
    const current: PublicSearchCriteria = {
      ...defaults,
      sale: "estate",
      date: "custom",
      from: "2026-08-01",
      to: "2026-08-03",
      view: "map",
      cursor: "eyJwYWdlIjoyfQ",
    };

    expect(buildSearchHref(defaults)).toBe("/search");
    expect(buildSearchHref(current)).toBe(
      "/search?sale=estate&date=custom&from=2026-08-01&to=2026-08-03&view=map",
    );
    expect(buildSearchHref(current, { sale: "yard" })).toBe(
      "/search?sale=yard&date=custom&from=2026-08-01&to=2026-08-03&view=map",
    );
    expect(buildSearchHref(current, { cursor: "bmV4dC1wYWdl" })).toBe(
      "/search?sale=estate&date=custom&from=2026-08-01&to=2026-08-03&view=map&cursor=bmV4dC1wYWdl",
    );
  });

  it("omits stale custom dates unless the custom preset is active", () => {
    expect(
      buildSearchHref({
        ...defaults,
        date: "today",
        from: "2026-08-01",
        to: "2026-08-03",
      }),
    ).toBe("/search?date=today");
  });

  it("provides stable active-filter counts and human-readable labels", () => {
    expect(activeFilterCount(defaults)).toBe(0);
    expect(
      activeFilterCount({ ...defaults, sale: "yard", date: "next-7-days" }),
    ).toBe(2);
    expect(dateFilterLabel({ ...defaults, date: "today" })).toBe("Today");
    expect(dateFilterLabel({ ...defaults, date: "weekend" })).toBe(
      "This weekend",
    );
    expect(dateFilterLabel({ ...defaults, date: "next-7-days" })).toBe(
      "Next 7 days",
    );
    expect(
      dateFilterLabel({
        ...defaults,
        date: "custom",
        from: "2026-08-01",
        to: "2026-08-03",
      }),
    ).toBe("2026-08-01 to 2026-08-03");
  });
});
