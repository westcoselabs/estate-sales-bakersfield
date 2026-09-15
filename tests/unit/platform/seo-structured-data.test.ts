import { describe, expect, it } from "vitest";

import { publicListingStructuredData } from "@/app/_components/public-listing-structured-data";
import type { PublicListingDetail } from "@/app/_components/published-listing-loader";
import {
  createPublicationSnapshot,
  publishedListing,
} from "@/modules/payments/application/publication";

import { readyEvent } from "../events/fixtures";

const base = new URL("https://sales.example.test");
const now = new Date("2026-07-21T00:00:00Z");
function organizer(
  privacyMode: "EXACT_ADDRESS" | "APPROXIMATE_LOCATION" | "HIDDEN_UNTIL_START",
  time = now,
): PublicListingDetail {
  const snapshot = createPublicationSnapshot(readyEvent({ privacyMode }));
  return {
    sourceKind: "ORGANIZER",
    ...publishedListing({
      eventId: "event-1",
      approvedRevision: 1,
      canonicalPath: snapshot.projection.path,
      publishedAt: now,
      snapshot,
      now: time,
    }),
  };
}

describe("public listing structured data", () => {
  it("includes real organizer photography and omits unknown venue names", () => {
    const graph = publicListingStructuredData(organizer("EXACT_ADDRESS"), base);
    expect(graph[0]).toMatchObject({
      "@type": "Event",
      image: [expect.stringContaining("/media/")],
      location: { address: { streetAddress: expect.any(String) } },
    });
    expect(graph[0]?.location).not.toHaveProperty("name");
    expect(graph[1]).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: expect.arrayContaining([
        expect.objectContaining({
          item: "https://sales.example.test/estate-sales",
        }),
      ]),
    });
  });

  it("never exposes exact address before release or for approximate listings", () => {
    for (const privacy of [
      "APPROXIMATE_LOCATION",
      "HIDDEN_UNTIL_START",
    ] as const) {
      const event = publicListingStructuredData(organizer(privacy), base)[0];
      expect(event?.location?.address).not.toHaveProperty("streetAddress");
      expect(event?.location?.address).not.toHaveProperty("postalCode");
    }
    expect(
      publicListingStructuredData(
        organizer("HIDDEN_UNTIL_START", new Date("2026-07-25T17:00:00Z")),
        base,
      )[0]?.location?.address,
    ).toHaveProperty("streetAddress");
  });

  it("does not claim generic imported placeholders are event photos or invent organizers", () => {
    const source = organizer("APPROXIMATE_LOCATION");
    const imported: PublicListingDetail = {
      sourceKind: "EXTERNAL",
      listingId: "external-1",
      canonicalPath: source.canonicalPath,
      publishedAt: now,
      sourceLabel: "Original source",
      sourceUrl: "https://source.example.test/sale",
      projection: {
        ...source.projection,
        coverPhotoUrl: "/images/marketplace-hero.webp",
        gallery: [],
      },
    };
    const event = publicListingStructuredData(imported, base)[0];
    expect(event).toHaveProperty("sameAs", imported.sourceUrl);
    expect(event).not.toHaveProperty("image");
    expect(event).not.toHaveProperty("organizer");
    expect(JSON.stringify(event)).not.toContain("marketplace-hero");
  });
});
