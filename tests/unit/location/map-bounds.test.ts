import { describe, expect, it } from "vitest";

import { searchBoundsForViewport } from "@/features/search/map-bounds";
import {
  buildSearchHref,
  normalizeSearchQuery,
} from "@/modules/public-search/application/criteria";

describe("map viewport searches", () => {
  it.each([
    { west: -119.2, south: 35.2, east: -118.9, north: 35.5 },
    { west: -119.01, south: 35.37, east: -119.009, north: 35.371 },
    { west: -121, south: 33, east: -117, north: 37 },
    { west: -119.45, south: 35.05, east: -119.4499, north: 35.0501 },
    { west: -118.6501, south: 35.7499, east: -118.65, north: 35.75 },
  ])(
    "keeps viewport %j inside the supported region and privacy minimum",
    (viewport) => {
      const bounds = searchBoundsForViewport(viewport);
      expect(bounds.west).toBeGreaterThanOrEqual(-119.45);
      expect(bounds.east).toBeLessThanOrEqual(-118.65);
      expect(bounds.south).toBeGreaterThanOrEqual(35.05);
      expect(bounds.north).toBeLessThanOrEqual(35.75);
      expect(bounds.east - bounds.west).toBeGreaterThanOrEqual(0.05);
      expect(bounds.north - bounds.south).toBeGreaterThanOrEqual(0.05);

      const initial = normalizeSearchQuery({
        sale: "estate",
        date: "weekend",
        cursor: "previouspage",
      }).criteria;
      const href = buildSearchHref(initial, { bounds });
      const normalized = normalizeSearchQuery(
        new URL(href, "https://example.test").searchParams,
      );
      expect(normalized.issue).toBeNull();
      expect(normalized.criteria).toMatchObject({
        sale: "estate",
        date: "weekend",
        cursor: null,
        bounds,
      });
    },
  );
});
