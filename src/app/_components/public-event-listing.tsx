import type { Metadata } from "next";
import Link from "next/link";

import type { PublishedListing } from "@/modules/payments";
import { getServerApplicationUrl } from "@/platform/config/application-url";

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
    description: `${projection.description.slice(0, 140)} — ${kind} in ${location}.`,
    alternates: { canonical: listing.canonicalPath },
    openGraph: {
      type: "website",
      title: `${projection.title} — ${location}`,
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

export function PublicEventListing({
  listing,
}: {
  readonly listing: PublishedListing;
}) {
  const projection = listing.projection;
  const format = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: projection.timezone,
  });
  const kind =
    projection.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale";
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
    <div className="preview-shell">
      <nav className="listing-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Bakersfield, CA</Link>
        <span aria-hidden="true"> / </span>
        <Link
          href={
            projection.eventType === "ESTATE_SALE"
              ? "/estate-sales"
              : "/yard-sales"
          }
        >
          {projection.eventType === "ESTATE_SALE"
            ? "Estate sales"
            : "Yard sales"}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{projection.title}</span>
      </nav>
      <article className="listing-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="listing-cover"
          src={projection.coverPhotoUrl}
          alt={`${projection.title} cover`}
        />
        <div className="listing-content">
          <p className="eyebrow">
            {kind} · {locationLabel(listing)}
          </p>
          <h1>{projection.title}</h1>
          <p className="listing-date">
            {format.format(new Date(projection.startsAt))} –{" "}
            {format.format(new Date(projection.endsAt))}
          </p>
          <h2>Location</h2>
          {projection.address.kind === "EXACT" ? (
            <address>
              {projection.address.addressLine1}
              {projection.address.addressLine2 ? (
                <>, {projection.address.addressLine2}</>
              ) : null}
              <br />
              {projection.address.city}, {projection.address.region}{" "}
              {projection.address.postalCode}
            </address>
          ) : projection.address.kind === "APPROXIMATE" ? (
            <p>{projection.address.label}. The exact address is private.</p>
          ) : (
            <p>
              The exact address will be released when the sale starts. This
              event is in {projection.address.city}, {projection.address.region}
              .
            </p>
          )}
          <h2>About this sale</h2>
          <p className="preserve-lines">{projection.description}</p>
          <h2>Hosted by</h2>
          <p>
            {projection.organizer.displayName}
            {projection.organizer.websiteUrl ? (
              <>
                {" · "}
                <a
                  href={projection.organizer.websiteUrl}
                  rel="noopener noreferrer nofollow"
                >
                  Organizer website
                </a>
              </>
            ) : null}
          </p>
          <h2>Gallery</h2>
          <div className="listing-gallery">
            {projection.gallery.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.url}
                alt={`${projection.title} item ${index + 1}`}
              />
            ))}
          </div>
          <p className="publication-proof">
            Published from approved revision {listing.approvedRevision}.
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
