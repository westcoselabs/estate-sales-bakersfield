import { Buffer } from "node:buffer";

import { parsePublicationSnapshot, projectionAt } from "@/modules/payments";

import type {
  PublicListingCardProjection,
  PublicMapMarkerProjection,
  PublicSearchCriteria,
  PublicSearchPage,
} from "../domain/types";
import type {
  PublicSearchCursor,
  PublicSearchRepository,
  PublicSearchSourceRecord,
} from "./ports";
import { resolvePublicDateInterval } from "./date-range";

const PUBLIC_ID = /^[0-9a-f]{12}$/;
const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 24;
const EXTERNAL_COVER_FALLBACK = "/images/marketplace-hero.webp";
const PUBLIC_ZONE_CENTROIDS = {
  bakersfield: {
    longitude: -119.018_712,
    latitude: 35.373_292,
    label: "Bakersfield area",
  },
} as const;

export class PublicSearchCursorError extends Error {
  constructor() {
    super("The search cursor does not match the active criteria");
    this.name = "PublicSearchCursorError";
  }
}

function criteriaFingerprint(criteria: PublicSearchCriteria): string {
  return JSON.stringify({
    sale: criteria.sale,
    date: criteria.date,
    from: criteria.from,
    to: criteria.to,
    location: criteria.location,
    sort: criteria.sort,
    bounds: criteria.bounds,
  });
}

function encodeCursor(cursor: PublicSearchCursor, fingerprint: string): string {
  return Buffer.from(
    JSON.stringify([
      "v2",
      cursor.startsAt.toISOString(),
      cursor.sourceKind,
      cursor.publicId,
      fingerprint,
    ]),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  value: string | null,
  fingerprint: string,
): PublicSearchCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!Array.isArray(parsed)) throw new PublicSearchCursorError();

    let startsAtValue: string;
    let sourceKind: PublicSearchCursor["sourceKind"];
    let publicId: string;
    let cursorFingerprint: string;
    if (
      parsed.length === 5 &&
      parsed[0] === "v2" &&
      typeof parsed[1] === "string" &&
      (parsed[2] === "ORGANIZER" || parsed[2] === "EXTERNAL") &&
      typeof parsed[3] === "string" &&
      typeof parsed[4] === "string"
    ) {
      startsAtValue = parsed[1];
      sourceKind = parsed[2];
      publicId = parsed[3];
      cursorFingerprint = parsed[4];
    } else if (
      parsed.length === 3 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      typeof parsed[2] === "string"
    ) {
      // The v1 cursor represented an organizer-only result set.
      startsAtValue = parsed[0];
      sourceKind = "ORGANIZER";
      publicId = parsed[1];
      cursorFingerprint = parsed[2];
    } else {
      throw new PublicSearchCursorError();
    }
    if (!PUBLIC_ID.test(publicId) || cursorFingerprint !== fingerprint) {
      throw new PublicSearchCursorError();
    }
    const startsAt = new Date(startsAtValue);
    if (Number.isNaN(startsAt.getTime())) throw new PublicSearchCursorError();
    return { startsAt, sourceKind, publicId };
  } catch {
    throw new PublicSearchCursorError();
  }
}

interface SearchProjection {
  readonly path: string;
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: string;
  readonly address: {
    readonly kind: "EXACT" | "APPROXIMATE" | "HIDDEN";
    readonly label?: string;
    readonly city: string;
    readonly region: string;
  };
  readonly coverPhotoUrl: string;
}

function sourceResultKey(
  source: PublicSearchSourceRecord,
): `event:${string}` | `external:${string}` {
  return source.sourceKind === "ORGANIZER"
    ? `event:${source.publicId}`
    : `external:${source.publicId}`;
}

function sourceProjection(
  source: PublicSearchSourceRecord,
  now: Date,
): SearchProjection {
  if (source.sourceKind === "ORGANIZER") {
    const snapshot = parsePublicationSnapshot(source.snapshot);
    const projection = projectionAt(snapshot, now);
    if (
      projection.path !== source.canonicalPath ||
      projection.eventType !== source.eventType
    ) {
      throw new Error(
        "The publication projection does not match its authority",
      );
    }
    return projection;
  }

  const hiddenUntilStart =
    source.content.privacyMode === "HIDDEN_UNTIL_START" &&
    now.getTime() < source.startsAt.getTime();
  const kind =
    source.content.privacyMode === "APPROXIMATE_LOCATION"
      ? "APPROXIMATE"
      : hiddenUntilStart
        ? "HIDDEN"
        : "EXACT";
  const zone =
    PUBLIC_ZONE_CENTROIDS[
      source.location.publicZone as keyof typeof PUBLIC_ZONE_CENTROIDS
    ];
  return {
    path: source.canonicalPath,
    eventType: source.eventType,
    title: source.content.title,
    startsAt: source.startsAt.toISOString(),
    endsAt: source.endsAt.toISOString(),
    localStartsAt: source.content.localStartsAt,
    localEndsAt: source.content.localEndsAt,
    timezone: source.content.timezone,
    address: {
      kind,
      ...(kind === "APPROXIMATE"
        ? { label: zone?.label ?? "Bakersfield area" }
        : {}),
      city: source.content.city,
      region: source.content.region,
    },
    coverPhotoUrl: source.content.coverPhotoUrl ?? EXTERNAL_COVER_FALLBACK,
  };
}

function cardProjection(
  source: PublicSearchSourceRecord,
  now: Date,
): PublicListingCardProjection {
  const projection = sourceProjection(source, now);
  const address = projection.address;
  return {
    id: source.publicId,
    sourceKind: source.sourceKind,
    resultKey: sourceResultKey(source),
    sourceLabel: source.sourceLabel,
    unclaimed: source.sourceKind === "EXTERNAL",
    href: source.canonicalPath,
    saleType: projection.eventType === "ESTATE_SALE" ? "estate" : "yard",
    title: projection.title,
    startsAt: projection.startsAt,
    endsAt: projection.endsAt,
    localStartsAt: projection.localStartsAt,
    localEndsAt: projection.localEndsAt,
    timezone: projection.timezone,
    location: {
      kind:
        address.kind === "EXACT"
          ? "exact"
          : address.kind === "APPROXIMATE"
            ? "approximate"
            : "hidden",
      label:
        address.kind === "APPROXIMATE"
          ? (address.label ?? "Bakersfield area")
          : `${address.city}, ${address.region}`,
      city: address.city,
      region: address.region,
    },
    coverPhotoUrl: projection.coverPhotoUrl,
  };
}

function markerProjection(
  source: PublicSearchSourceRecord,
  now: Date,
): PublicMapMarkerProjection | null {
  const projection = sourceProjection(source, now);
  const protectedLocation = projection.address.kind !== "EXACT";
  const zone =
    PUBLIC_ZONE_CENTROIDS[
      source.location.publicZone as keyof typeof PUBLIC_ZONE_CENTROIDS
    ];
  const coordinates = protectedLocation
    ? zone
      ? ([zone.longitude, zone.latitude] as const)
      : null
    : source.location.confirmationStatus === "CONFIRMED" &&
        source.location.latitude !== null &&
        source.location.longitude !== null
      ? ([source.location.longitude, source.location.latitude] as const)
      : null;
  if (!coordinates) return null;
  return {
    id: source.publicId,
    sourceKind: source.sourceKind,
    resultKey: sourceResultKey(source),
    sourceLabel: source.sourceLabel,
    unclaimed: source.sourceKind === "EXTERNAL",
    href: source.canonicalPath,
    saleType: projection.eventType === "ESTATE_SALE" ? "estate" : "yard",
    title: projection.title,
    startsAt: projection.startsAt,
    endsAt: projection.endsAt,
    localStartsAt: projection.localStartsAt,
    localEndsAt: projection.localEndsAt,
    timezone: projection.timezone,
    locationLabel: protectedLocation
      ? (zone?.label ?? "Bakersfield area")
      : `${projection.address.city}, ${projection.address.region}`,
    coverPhotoUrl: projection.coverPhotoUrl,
    geometry: { type: "Point", coordinates },
    markerKind:
      projection.address.kind === "EXACT"
        ? "exact"
        : projection.address.kind === "HIDDEN"
          ? "hidden"
          : "approximate",
  };
}

export class PublicSearchService {
  constructor(private readonly repository: PublicSearchRepository) {}

  async search(
    criteria: PublicSearchCriteria,
    now = new Date(),
    requestedLimit = DEFAULT_LIMIT,
  ): Promise<PublicSearchPage> {
    const limit = Math.min(Math.max(requestedLimit, 1), MAXIMUM_LIMIT);
    const fingerprint = criteriaFingerprint(criteria);
    const rows = await this.repository.search({
      eventType:
        criteria.sale === "estate"
          ? "ESTATE_SALE"
          : criteria.sale === "yard"
            ? "YARD_SALE"
            : null,
      location: { city: "Bakersfield", region: "CA" },
      activeAfter: now,
      range: resolvePublicDateInterval(criteria, now),
      cursor: decodeCursor(criteria.cursor, fingerprint),
      limit: limit + 1,
      bounds: criteria.bounds ?? null,
    });
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    const items = visible.map((row) => cardProjection(row, now));
    const markers = visible
      .map((row) => markerProjection(row, now))
      .filter((marker): marker is PublicMapMarkerProjection => marker !== null);
    return {
      schema: "public-search-v1",
      criteria,
      items,
      markers,
      pageInfo: {
        hasNext: rows.length > limit,
        nextCursor:
          rows.length > limit && last
            ? encodeCursor(
                {
                  startsAt: last.startsAt,
                  sourceKind: last.sourceKind,
                  publicId: last.publicId,
                },
                fingerprint,
              )
            : null,
      },
    };
  }
}
