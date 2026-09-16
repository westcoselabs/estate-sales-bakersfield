import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { PublishedListing } from "@/modules/payments";
import { getServerApplicationUrl } from "@/platform/config/application-url";
import {
  importedListingIndexingEnabled,
  prelaunchRobots,
  publicRobots,
} from "@/platform/seo/indexing-policy";

import type { PublicListingDetail } from "./published-listing-loader";
import { toOrganizerPublicListing } from "./published-listing-loader";
import { PublicListingActions } from "./public-listing-actions";
import { PublicListingDetailTabs } from "./public-listing-detail-tabs";
import { publicListingStructuredData } from "./public-listing-structured-data";
import { PublicSaleSchedule } from "./public-sale-schedule";

function locationLabel(listing: PublicListingDetail): string {
  return `${listing.projection.address.city}, ${listing.projection.address.region}`;
}

export function publicListingMetadata(listing: PublicListingDetail): Metadata {
  const projection = listing.projection;
  const location = locationLabel(listing);
  const kind =
    projection.eventType === "ESTATE_SALE" ? "Estate Sale" : "Yard Sale";
  return {
    title: `${projection.title} | ${kind} in ${location}`,
    description: `${projection.description.slice(0, 140)}. ${kind} in ${location}.`,
    alternates: { canonical: listing.canonicalPath },
    robots:
      listing.sourceKind === "EXTERNAL" && !importedListingIndexingEnabled()
        ? prelaunchRobots
        : publicRobots(),
    openGraph: {
      type: "website",
      title: `${projection.title} | ${location}`,
      description: projection.description.slice(0, 180),
      url: listing.canonicalPath,
      images: [{ url: projection.coverPhotoUrl, alt: projection.title }],
    },
  };
}

function visibleAddress(listing: PublicListingDetail): {
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
    primary: `${address.city}, ${address.region}${address.postalCode ? ` ${address.postalCode}` : ""}`,
    secondary: `Full address will be shown on ${new Intl.DateTimeFormat(
      "en-US",
      {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: listing.projection.timezone,
      },
    ).format(new Date(address.releasesAt))}.`,
    directionsQuery: `${address.city}, ${address.region}`,
  };
}

export function PublicListing({
  listing,
  revisionNote,
}: {
  readonly listing: PublicListingDetail;
  readonly revisionNote?: string;
}) {
  const projection = listing.projection;
  const organizer =
    listing.sourceKind === "ORGANIZER" ? listing.projection.organizer : null;
  const verifiedEmail =
    listing.sourceKind === "ORGANIZER" ? listing.verifiedEmail : null;
  const kind =
    projection.eventType === "ESTATE_SALE" ? "Estate sale" : "Yard sale";
  const listingTypePath =
    projection.eventType === "ESTATE_SALE" ? "/estate-sales" : "/yard-sales";
  const address = visibleAddress(listing);
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.directionsQuery)}`;
  const emailHref = verifiedEmail
    ? `mailto:${encodeURIComponent(verifiedEmail)}`
    : null;
  const hasContactDetails = Boolean(
    verifiedEmail || organizer?.displayName || organizer?.websiteUrl,
  );
  const applicationUrl = getServerApplicationUrl();
  const structuredData = publicListingStructuredData(listing, applicationUrl);
  const photoCount =
    listing.sourceKind === "ORGANIZER"
      ? Math.max(1, projection.gallery.length)
      : 0;
  const publicationProof =
    listing.sourceKind === "EXTERNAL"
      ? `External listing attributed to ${listing.sourceLabel}. Estate Sales Bakersfield is not the organizer.`
      : revisionNote;

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

      <article className="public-listing" data-source-kind={listing.sourceKind}>
        <div className="public-listing-overview">
          <header className="public-listing-hero">
            <div className="public-listing-hero__panel">
              <p className="public-listing-hero__eyebrow">
                {kind} <span aria-hidden="true">•</span>{" "}
                {locationLabel(listing)}
              </p>
              <h1>{projection.title}</h1>

              <div className="public-listing-facts">
                <div>
                  <span aria-hidden="true">
                    <Icon name="calendar" size={24} />
                  </span>
                  <PublicSaleSchedule projection={projection} />
                </div>
                <div>
                  <span aria-hidden="true">
                    <Icon name="pin" size={24} />
                  </span>
                  <p>
                    <strong>{address.primary}</strong>
                    <span>{address.secondary}</span>
                    {projection.address.kind === "EXACT" ? (
                      <a
                        className="public-listing-fact__link"
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Get directions
                      </a>
                    ) : null}
                  </p>
                </div>
                {listing.sourceKind === "EXTERNAL" ? (
                  <div>
                    <span aria-hidden="true">
                      <Icon name="external" size={24} />
                    </span>
                    <p>
                      <strong>Unclaimed / External listing</strong>
                      <span>Source: {listing.sourceLabel}</span>
                      <a
                        href={listing.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow external"
                      >
                        View original listing
                      </a>
                    </p>
                  </div>
                ) : hasContactDetails && organizer ? (
                  <div>
                    <span aria-hidden="true">
                      <Icon name="user" size={24} />
                    </span>
                    <p>
                      <span>Contact</span>
                      {verifiedEmail && emailHref ? (
                        <strong>
                          <a href={emailHref}>{verifiedEmail}</a>
                        </strong>
                      ) : null}
                      {organizer.displayName ? (
                        <span>Listed by {organizer.displayName}</span>
                      ) : null}
                      {organizer.websiteUrl ? (
                        <a
                          href={organizer.websiteUrl}
                          rel="noopener noreferrer nofollow"
                        >
                          Website
                        </a>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </div>

              <PublicListingActions
                contactHref={emailHref}
                directionsUrl={
                  projection.address.kind === "EXACT" ? directionsUrl : null
                }
                title={projection.title}
              />
            </div>
          </header>

          <figure
            className="public-listing-cover"
            {...(listing.sourceKind === "EXTERNAL"
              ? {
                  "aria-label": "External listing image placeholder",
                  "data-external-listing-placeholder": "true",
                }
              : {})}
          >
            {/* The repeated image is decorative and creates the blurred edge fill. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="public-listing-cover__backdrop"
              src={projection.coverPhotoUrl}
              alt=""
              aria-hidden="true"
            />
            <div className="public-listing-cover__frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="public-listing-cover__image"
                src={projection.coverPhotoUrl}
                alt={
                  listing.sourceKind === "EXTERNAL"
                    ? `Marketplace placeholder for ${projection.title}`
                    : `Cover photo for ${projection.title}`
                }
              />
            </div>
            {photoCount > 0 ? (
              <span className="public-listing-cover__count">
                <Icon name="photo" size={19} />
                {photoCount} {photoCount === 1 ? "photo" : "photos"}
              </span>
            ) : null}
          </figure>
        </div>

        <div className="public-listing-content">
          <PublicListingDetailTabs
            description={projection.description}
            external={listing.sourceKind === "EXTERNAL"}
            photos={projection.gallery}
            title={projection.title}
          />

          {publicationProof ? (
            <p className="publication-proof">{publicationProof}</p>
          ) : null}
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

/** Organizer previews retain their established component contract. */
export function PublicEventListing({
  listing,
  revisionNote,
}: {
  readonly listing: PublishedListing;
  readonly revisionNote?: string;
}) {
  return (
    <PublicListing
      listing={toOrganizerPublicListing(listing)}
      {...(revisionNote === undefined ? {} : { revisionNote })}
    />
  );
}
