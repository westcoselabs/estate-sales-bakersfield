import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform/config/application-url", () => ({
  getServerApplicationUrl: () => new URL("https://www.example.test"),
}));

import { PublicListing } from "@/app/_components/public-event-listing";
import type { OrganizerPublicListing } from "@/app/_components/published-listing-loader";
import {
  createPublicationSnapshot,
  publishedListing,
} from "@/modules/payments/application/publication";

import { readyEvent } from "../events/fixtures";

function listing(now: string): OrganizerPublicListing {
  const event = readyEvent({
    privacyMode: "HIDDEN_UNTIL_START",
    addressRevealAt: new Date("2026-10-04T13:00:00.000Z"),
    startsAt: new Date("2026-10-04T15:00:00.000Z"),
    endsAt: new Date("2026-10-06T20:00:00.000Z"),
    localStartsAt: "2026-10-04T08:00",
    localEndsAt: "2026-10-06T13:00",
    scheduleDays: [4, 5, 6].map((day) => ({
      date: `2026-10-0${String(day)}`,
      startTime: "08:00",
      endTime: "13:00",
    })),
  });
  return {
    sourceKind: "ORGANIZER",
    ...publishedListing({
      eventId: event.id,
      approvedRevision: 1,
      canonicalPath: "/estate-sales/summer-estate-sale-abc123def456",
      publishedAt: new Date(now),
      now: new Date(now),
      snapshot: createPublicationSnapshot(event),
    }),
  };
}

describe("public daily sale detail", () => {
  it("renders all three days with a closing time and the exact scheduled address notice", () => {
    const html = renderToStaticMarkup(
      createElement(PublicListing, {
        listing: listing("2026-10-03T12:00:00Z"),
      }),
    );
    expect(html).toContain('aria-label="Daily sale hours"');
    expect(html).toContain("Pacific Time");
    for (const date of [
      "Sun, Oct 4, 2026",
      "Mon, Oct 5, 2026",
      "Tue, Oct 6, 2026",
    ])
      expect(html).toContain(date);
    expect(html.match(/8:00 AM – 1:00 PM/g)).toHaveLength(3);
    expect(html).toContain(
      "Full address will be shown on Sun, Oct 4, 6:00 AM PDT.",
    );
    expect(html).not.toContain("123 Main Street");
    expect(html).not.toContain("Get directions");
  });

  it("provides exact address and directions at the chosen reveal instant", () => {
    const html = renderToStaticMarkup(
      createElement(PublicListing, {
        listing: listing("2026-10-04T13:00:00Z"),
      }),
    );
    expect(html).toContain("123 Main Street");
    expect(html).toContain("Get directions");
    expect(html).not.toContain("Full address will be shown");
  });
});
