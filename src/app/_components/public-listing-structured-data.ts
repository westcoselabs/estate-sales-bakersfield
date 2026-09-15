import type { PublicListingDetail } from "./published-listing-loader";

export function publicListingStructuredData(
  listing: PublicListingDetail,
  applicationUrl: URL,
) {
  const projection = listing.projection;
  const address = projection.address;
  const organizer =
    listing.sourceKind === "ORGANIZER" ? listing.projection.organizer : null;
  const hub =
    projection.eventType === "ESTATE_SALE" ? "/estate-sales" : "/yard-sales";
  const href = (path: string) => new URL(path, applicationUrl).toString();
  return [
    {
      "@context": "https://schema.org",
      "@type": "Event",
      name: projection.title,
      description: projection.description,
      startDate: projection.startsAt,
      endDate: projection.endsAt,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      url: href(listing.canonicalPath),
      // A directory placeholder is not a photograph of an imported sale.
      ...(listing.sourceKind === "ORGANIZER"
        ? { image: [href(projection.coverPhotoUrl)] }
        : { sameAs: listing.sourceUrl }),
      location: {
        "@type": "Place",
        // No venue name is collected. A city is not a venue name.
        address: {
          "@type": "PostalAddress",
          addressLocality: address.city,
          addressRegion: address.region,
          addressCountry: address.countryCode,
          ...(address.kind === "EXACT"
            ? {
                streetAddress: [address.addressLine1, address.addressLine2]
                  .filter(Boolean)
                  .join(", "),
                postalCode: address.postalCode,
              }
            : {}),
        },
      },
      ...(organizer?.displayName
        ? {
            organizer: {
              "@type": "Organization",
              name: organizer.displayName,
              ...(organizer.websiteUrl ? { url: organizer.websiteUrl } : {}),
            },
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: href("/") },
        {
          "@type": "ListItem",
          position: 2,
          name: hub === "/estate-sales" ? "Estate sales" : "Yard sales",
          item: href(hub),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: projection.title,
          item: href(listing.canonicalPath),
        },
      ],
    },
  ] as const;
}
