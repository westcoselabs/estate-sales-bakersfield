import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform/config/application-url", () => ({
  getServerApplicationUrl: () => new URL("https://www.example.test"),
}));

import {
  PublicListing,
  publicListingMetadata,
} from "@/app/_components/public-event-listing";
import type { ExternalPublicListing } from "@/app/_components/published-listing-loader";

const externalListing: ExternalPublicListing = {
  sourceKind: "EXTERNAL",
  listingId: "20000000-0000-4000-8000-000000000001",
  canonicalPath: "/estate-sales/external-sale-abc123def456",
  publishedAt: new Date("2026-08-01T18:00:00.000Z"),
  sourceLabel: "EstateSales.org",
  sourceUrl: "https://www.estatesales.org/example-listing",
  projection: {
    title: "External Bakersfield estate sale",
    description:
      "An imported external listing with furniture, books, and household goods.",
    eventType: "ESTATE_SALE",
    path: "/estate-sales/external-sale-abc123def456",
    startsAt: "2026-08-10T16:00:00.000Z",
    endsAt: "2026-08-11T23:00:00.000Z",
    timezone: "America/Los_Angeles",
    localStartsAt: "2026-08-10T09:00",
    localEndsAt: "2026-08-11T16:00",
    address: {
      kind: "APPROXIMATE",
      city: "Bakersfield",
      region: "CA",
      countryCode: "US",
      label: "Near Bakersfield, CA",
    },
    coverPhotoUrl: "/images/marketplace-hero.webp",
    gallery: [],
  },
};

describe("external public listing detail", () => {
  it("renders attribution and a local placeholder without organizer or gallery data", () => {
    const html = renderToStaticMarkup(
      createElement(PublicListing, { listing: externalListing }),
    );

    expect(html).toContain("Unclaimed / External listing");
    expect(html).toContain("Source: EstateSales.org");
    expect(html).toContain("View original listing");
    expect(html).toContain(
      'href="https://www.estatesales.org/example-listing"',
    );
    expect(html).toContain('src="/images/marketplace-hero.webp"');
    expect(html).toContain('data-external-listing-placeholder="true"');
    expect(html).toContain("Source transparency");
    expect(html).toContain("Estate Sales Bakersfield is not the organizer.");
    expect(html).not.toContain("Listed by");
    expect(html).not.toContain("Contact");
    expect(html).not.toContain("Pictures");
    expect(html).not.toContain("photo gallery");
    expect(html).not.toContain('"organizer":');
    expect(html).not.toContain(
      'src="https://www.estatesales.org/example-listing"',
    );
  });

  it("uses the external canonical URL and placeholder in indexable metadata", () => {
    const metadata = publicListingMetadata(externalListing);

    expect(metadata.alternates).toEqual({
      canonical: externalListing.canonicalPath,
    });
    expect(metadata.openGraph).toMatchObject({
      url: externalListing.canonicalPath,
      images: [
        {
          url: "/images/marketplace-hero.webp",
          alt: externalListing.projection.title,
        },
      ],
    });
    expect(metadata.robots).toBeUndefined();
  });
});
