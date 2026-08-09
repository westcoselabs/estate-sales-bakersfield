import "server-only";

import type { PublicEventProjection } from "@/modules/events";
import { createConfiguredPaymentService } from "@/modules/payments";
import type { PublishedListing } from "@/modules/payments";
import { getPrismaClient } from "@/platform/database/client";

const LISTING = /^([a-z0-9-]+)-([0-9a-f]{12})$/u;
export const EXTERNAL_LISTING_PLACEHOLDER = "/images/marketplace-hero.webp";

type PublicEventType = "ESTATE_SALE" | "YARD_SALE";
type PublicAddressProjection = PublicEventProjection["address"];

export type OrganizerPublicListing = PublishedListing & {
  readonly sourceKind: "ORGANIZER";
};

export interface ExternalPublicListing {
  readonly sourceKind: "EXTERNAL";
  readonly listingId: string;
  readonly canonicalPath: string;
  readonly publishedAt: Date;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly projection: {
    readonly title: string;
    readonly description: string;
    readonly eventType: PublicEventType;
    readonly path: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly timezone: string;
    readonly localStartsAt: string;
    readonly localEndsAt: string;
    readonly address: PublicAddressProjection;
    readonly coverPhotoUrl: typeof EXTERNAL_LISTING_PLACEHOLDER;
    readonly gallery: readonly [];
  };
}

export type PublicListingDetail =
  OrganizerPublicListing | ExternalPublicListing;

function listingHub(eventType: PublicEventType): "estate-sales" | "yard-sales" {
  return eventType === "ESTATE_SALE" ? "estate-sales" : "yard-sales";
}

function sourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function addressProjection(
  privacyMode: "EXACT_ADDRESS" | "APPROXIMATE_LOCATION" | "HIDDEN_UNTIL_START",
  location: {
    readonly addressLine1: string;
    readonly addressLine2: string | null;
    readonly city: string;
    readonly region: string;
    readonly postalCode: string;
    readonly countryCode: string;
  },
  startsAt: Date,
  now: Date,
): PublicAddressProjection {
  if (privacyMode === "APPROXIMATE_LOCATION") {
    return {
      kind: "APPROXIMATE",
      city: location.city,
      region: location.region,
      countryCode: location.countryCode,
      label: `Near ${location.city}, ${location.region}`,
    };
  }
  if (
    privacyMode === "HIDDEN_UNTIL_START" &&
    now.getTime() < startsAt.getTime()
  ) {
    return {
      kind: "HIDDEN",
      city: location.city,
      region: location.region,
      countryCode: location.countryCode,
      releasesAt: startsAt.toISOString(),
    };
  }
  return {
    kind: "EXACT",
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    region: location.region,
    postalCode: location.postalCode,
    countryCode: location.countryCode,
  };
}

async function loadExternalListing(
  publicId: string,
  now: Date,
): Promise<ExternalPublicListing | null> {
  const listing = await getPrismaClient().externalListing.findFirst({
    where: {
      publicId,
      status: "PUBLISHED",
      endsAt: { gt: now },
    },
    select: {
      id: true,
      publicId: true,
      slug: true,
      canonicalPath: true,
      eventType: true,
      title: true,
      description: true,
      localStartsAt: true,
      localEndsAt: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      privacyMode: true,
      status: true,
      attribution: true,
      publishedAt: true,
      location: {
        select: {
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          countryCode: true,
          confirmationStatus: true,
        },
      },
      primarySourceRecord: {
        select: {
          sourceListingId: true,
          source: { select: { id: true, key: true } },
        },
      },
    },
  });

  if (
    !listing ||
    listing.status !== "PUBLISHED" ||
    listing.publicId !== publicId ||
    listing.endsAt.getTime() <= now.getTime() ||
    listing.endsAt.getTime() <= listing.startsAt.getTime() ||
    !listing.location ||
    listing.location.confirmationStatus !== "CONFIRMED"
  ) {
    return null;
  }

  const eventType = listing.eventType;
  const canonicalPath = `/${listingHub(eventType)}/${listing.slug}-${publicId}`;
  if (listing.canonicalPath !== canonicalPath) return null;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: listing.timezone });
  } catch {
    return null;
  }

  const attribution = record(listing.attribution);
  const originalUrl = sourceUrl(attribution?.sourceUrl);
  const sourceName = attribution?.sourceName;
  if (
    attribution?.schema !== "external-listing-attribution.v1" ||
    attribution.sourceId !== listing.primarySourceRecord.source.id ||
    attribution.sourceKey !== listing.primarySourceRecord.source.key ||
    attribution.sourceListingId !==
      listing.primarySourceRecord.sourceListingId ||
    typeof sourceName !== "string" ||
    sourceName.length < 1 ||
    sourceName.length > 120 ||
    !originalUrl
  ) {
    return null;
  }

  return {
    sourceKind: "EXTERNAL",
    listingId: listing.id,
    canonicalPath,
    publishedAt: listing.publishedAt,
    sourceLabel: sourceName,
    sourceUrl: originalUrl,
    projection: {
      title: listing.title,
      description: listing.description,
      eventType,
      path: canonicalPath,
      startsAt: listing.startsAt.toISOString(),
      endsAt: listing.endsAt.toISOString(),
      timezone: listing.timezone,
      localStartsAt: listing.localStartsAt,
      localEndsAt: listing.localEndsAt,
      address: addressProjection(
        listing.privacyMode,
        listing.location,
        listing.startsAt,
        now,
      ),
      coverPhotoUrl: EXTERNAL_LISTING_PLACEHOLDER,
      gallery: [],
    },
  };
}

function organizerListing(
  listing: PublishedListing | null,
): OrganizerPublicListing | null {
  return listing ? { ...listing, sourceKind: "ORGANIZER" } : null;
}

function selectUnambiguousListing(
  requestPath: string,
  organizer: OrganizerPublicListing | null,
  external: ExternalPublicListing | null,
): PublicListingDetail | null {
  const available = [organizer, external].filter(
    (listing): listing is PublicListingDetail => listing !== null,
  );
  const exact = available.filter(
    (listing) => listing.canonicalPath === requestPath,
  );
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1) return null;
  return available.length === 1 ? (available[0] ?? null) : null;
}

export async function loadPublishedListing(
  eventType: PublicEventType,
  value: string,
  now = new Date(),
): Promise<PublicListingDetail | null> {
  const match = LISTING.exec(value);
  if (!match) return null;
  const publicId = match[2];
  if (!publicId) return null;

  const [publishedOrganizer, external] = await Promise.all([
    createConfiguredPaymentService().published(eventType, publicId, now),
    loadExternalListing(publicId, now),
  ]);
  const requestPath = `/${listingHub(eventType)}/${value}`;
  return selectUnambiguousListing(
    requestPath,
    organizerListing(publishedOrganizer),
    external,
  );
}

export function toOrganizerPublicListing(
  listing: PublishedListing,
): OrganizerPublicListing {
  return { ...listing, sourceKind: "ORGANIZER" };
}
