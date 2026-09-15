import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/search/explore-map-loader", () => ({
  ExploreMapLoader: () => null,
}));

import { SearchResults } from "@/features/search/search-results";
import {
  ListingCard,
  formatListingSchedule,
} from "@/features/search/listing-card";
import { normalizeSearchQuery } from "@/modules/public-search/application/criteria";
import type { PublicListingCardProjection } from "@/modules/public-search/client";

const listing: PublicListingCardProjection = {
  id: "fixture",
  sourceKind: "ORGANIZER",
  resultKey: "event:fixture",
  sourceLabel: null,
  unclaimed: false,
  href: "/estate-sales/fixture-abc123def456",
  saleType: "estate",
  title: "Fixture sale",
  startsAt: "2027-08-01T16:00:00Z",
  endsAt: "2027-08-01T22:00:00Z",
  localStartsAt: "2027-08-01T09:00",
  localEndsAt: "2027-08-01T15:00",
  timezone: "America/Los_Angeles",
  location: {
    kind: "hidden",
    label: "Bakersfield",
    city: "Bakersfield",
    region: "CA",
  },
  coverPhotoUrl: "/media/photo-fixture/cover",
};

describe("search results rendering", () => {
  it("summarizes matching daily hours and distinguishes skipped days and varying hours", () => {
    const scheduleDays = [4, 5, 6].map((day) => ({
      date: `2026-10-0${String(day)}`,
      startTime: "08:00",
      endTime: "13:00",
      startsAt: `2026-10-0${String(day)}T15:00:00.000Z`,
      endsAt: `2026-10-0${String(day)}T20:00:00.000Z`,
    }));
    expect(formatListingSchedule({ ...listing, scheduleDays })).toEqual({
      date: "Oct 4 to Oct 6",
      time: "8:00 AM to 1:00 PM daily",
    });
    expect(
      formatListingSchedule({
        ...listing,
        scheduleDays: scheduleDays.filter((day) => day.date !== "2026-10-05"),
      }),
    ).toEqual({
      date: "Oct 4 to Oct 6 · 2 sale days",
      time: "8:00 AM to 1:00 PM",
    });
    expect(
      formatListingSchedule({
        ...listing,
        scheduleDays: scheduleDays.map((day, index) =>
          index === 1 ? { ...day, endTime: "14:00" } : day,
        ),
      }).time,
    ).toBe("Hours vary by day");
  });

  it("shows a scheduled address release in Pacific time without directions", () => {
    const html = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: {
          ...listing,
          location: {
            ...listing.location,
            releasesAt: "2026-10-04T13:00:00.000Z",
          },
        },
      }),
    );
    expect(html).toContain("Address available Oct 4, 6:00 AM PDT");
    expect(html).not.toContain("Get directions");
  });

  it.each(["map", "list"] as const)(
    "exposes crawlable pagination in the active %s view",
    (view) => {
      const criteria = normalizeSearchQuery({
        view,
        sale: "estate",
        cursor: "previouspage",
      }).criteria;
      const html = renderToStaticMarkup(
        createElement(SearchResults, {
          result: {
            schema: "public-search-v1",
            criteria,
            items: [listing],
            markers: [],
            pageInfo: { hasNext: true, nextCursor: "nextpagecursor" },
          },
          criteria,
          view,
          mapVisited: view === "map",
          pending: false,
          onNavigate: vi.fn(),
          onClear: vi.fn(),
        }),
      );
      const activeView = html
        .split(`explore-results-view--${view}\"`)[1]!
        .split("explore-results-view--")[0]!;
      expect(activeView).not.toMatch(/^ hidden/);
      expect(activeView).toContain('aria-label="Result pages"');
      expect(activeView).toContain("First results");
      expect(activeView).toContain("Next results");
      expect(activeView).toContain("cursor=nextpagecursor");
      expect(activeView).toContain("sale=estate");
    },
  );

  it("uses the card image rendition without changing imported placeholders or revealing private directions", () => {
    const html = renderToStaticMarkup(createElement(ListingCard, { listing }));
    expect(html).toContain('src="/media/photo-fixture/card"');
    expect(html).not.toContain("/cover");
    expect(html).not.toContain("Get directions");
    expect(
      renderToStaticMarkup(
        createElement(ListingCard, {
          listing: {
            ...listing,
            coverPhotoUrl: "/images/marketplace-hero.webp",
          },
        }),
      ),
    ).toContain('src="/images/marketplace-hero.webp"');
  });
});
