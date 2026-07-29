import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { PublishedListing } from "@/modules/payments";
import { getServerApplicationUrl } from "@/platform/config/application-url";

import { PublicListingActions } from "./public-listing-actions";
import { PublicListingDetailTabs } from "./public-listing-detail-tabs";

function locationLabel(listing: PublishedListing): string {
  return `${listing.projection.address.city}, ${listing.projection.address.region}`;
}

export function publicListingMetadata(listing: PublishedListing): Metadata {
  const projection = listing.projection;
  const location = locationLabel(listing);
  const kind =
    projection.eventType === "ESTATE_SALE" ? "Estate Sale" : "Yard Sale";
  return {
    title: `${projection.title} | ${kind} in ${location}`,
    description: `${projection.description.slice(0, 140)}. ${kind} in ${location}.`,
    alternates: { canonical: listing.canonicalPath },
    openGraph: {
      type: "website",
      title: `${projection.title} | ${location}`,
      description: projection.description.slice(0, 180),
      url: listing.canonicalPath,
      images: [{ url: projection.coverPhotoUrl, alt: projection.title }],
    },
  };
}

function structuredAddress(listing: PublishedListing) {
  const address = listing.projection.address;
  return address.kind === "EXACT"
    ? {
        "@type": "PostalAddress",
        streetAddress: [address.addressLine1, address.addressLine2]
          .filter(Boolean)
          .join(", "),
        addressLocality: address.city,
        addressRegion: address.region,
        postalCode: address.postalCode,
        addressCountry: address.countryCode,
      }
    : {
        "@type": "PostalAddress",
        addressLocality: address.city,
        addressRegion: address.region,
        addressCountry: address.countryCode,
      };
}

function visibleAddress(listing: PublishedListing): {
  readonly primary: string;
  readonly secondary: string;
  readonly directionsQuery: string;
} {
  const address = listing.projection.address;
  if (address.kind === "EXACT") {
    const primary = [address.addressLine1, address.addressLine2]
      .filter(Boolean)
      .join(", ");
    const secondary = `${address.city}, ${address.region} ${address.postalCode}`;
    return {
      primary,
      secondary,
      directionsQuery: `${primary}, ${secondary}`,
    };
  }
  if (address.kind === "APPROXIMATE") {
    return {
      primary: address.label,
      secondary: "Exact address is private",
      directionsQuery: `${address.city}, ${address.region}`,
    };
  }
  return {
    primary: `${address.city}, ${address.region}`,
    secondary: "Address releases when the sale starts",
    directionsQuery: `${address.city}, ${address.region}`,
  };
}

export function PublicEventListing({
  listing,
  revisionNote,
}: {
  readonly listing: PublishedListing;
  readonly revisionNote?: string;
}) {
  const projection = listing.projection;
  const format = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: projection.timezone,
  });
  const kind =
    projection.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale";
  const listingTypePath =
    projection.eventType === "ESTATE_SALE" ? "/estate-sales" : "/yard-sales";
  const address = visibleAddress(listing);
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.directionsQuery)}`;
  const applicationUrl = getServerApplicationUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: projection.title,
    description: projection.description,
    startDate: projection.startsAt,
    endDate: projection.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: new URL(listing.canonicalPath, applicationUrl).toString(),
    image: [new URL(projection.coverPhotoUrl, applicationUrl).toString()],
    location: {
      "@type": "Place",
      name: locationLabel(listing),
      address: structuredAddress(listing),
    },
    organizer: {
      "@type": "Organization",
      name: projection.organizer.displayName,
      ...(projection.organizer.websiteUrl
        ? { url: projection.organizer.websiteUrl }
        : {}),
    },
  };

  return (
    <div className="preview-shell public-listing-page">
      <nav className="listing-breadcrumb" aria-label="Breadcrumb">
        <Link href="/search">Bakersfield, CA</Link>
        <Icon name="chevron" size={15} />
        <Link href={listingTypePath}>
          {projection.eventType === "ESTATE_SALE"
            ? "Estate sales"
            : "Yard sales"}
        </Link>
        <Icon name="chevron" size={15} />
        <span>{projection.title}</span>
      </nav>

      <article className="public-listing">
        <header className="public-listing-hero">
          <div className="public-listing-hero__glow" aria-hidden="true" />
          <div className="public-listing-hero__panel">
            <p className="public-listing-hero__eyebrow">
              {kind} <span aria-hidden="true">•</span> {locationLabel(listing)}
            </p>
            <h1>{projection.title}</h1>

            <div className="public-listing-facts">
              <div>
                <span aria-hidden="true">
                  <Icon name="calendar" size={24} />
                </span>
                <p>
                  <strong>
                    {format.format(new Date(projection.startsAt))}
                  </strong>
                  <span>{format.format(new Date(projection.endsAt))}</span>
                </p>
              </div>
              <div>
                <span aria-hidden="true">
                  <Icon name="pin" size={24} />
                </span>
                <p>
                  <strong>{address.primary}</strong>
                  <span>{address.secondary}</span>
                </p>
              </div>
              <div>
                <span aria-hidden="true">
                  <Icon name="user" size={24} />
                </span>
                <p>
                  <span>Hosted by</span>
                  <strong>{projection.organizer.displayName}</strong>
                  {projection.organizer.websiteUrl ? (
                    <a
                      href={projection.organizer.websiteUrl}
                      rel="noopener noreferrer nofollow"
                    >
                      Organizer website
                    </a>
                  ) : null}
                </p>
              </div>
            </div>

            <PublicListingActions
              directionsUrl={directionsUrl}
              title={projection.title}
            />
          </div>
        </header>

        <div className="public-listing-content">
          <PublicListingDetailTabs
            description={projection.description}
            photos={projection.gallery}
            title={projection.title}
          />

          <section
            className="public-listing-trust"
            aria-label="Listing highlights"
          >
            <div>
              <Icon name="status" size={24} />
              <p>
                <strong>Quality finds</strong>
                <span>Preview items before you visit</span>
              </p>
            </div>
            <div>
              <Icon name="clock" size={24} />
              <p>
                <strong>Exact timing</strong>
                <span>Server-validated sale hours</span>
              </p>
            </div>
            <div>
              <Icon name="pin" size={24} />
              <p>
                <strong>Local listing</strong>
                <span>Focused on Bakersfield</span>
              </p>
            </div>
            <div>
              <Icon name="shield" size={24} />
              <p>
                <strong>Privacy aware</strong>
                <span>Location shared by the organizer</span>
              </p>
            </div>
          </section>

          <p className="publication-proof">
            {revisionNote ??
              `Published from approved revision ${String(listing.approvedRevision)}.`}
          </p>
        </div>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
      />
    </div>
  );
}
