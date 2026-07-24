import { Buffer } from "node:buffer";

import { parsePublicationSnapshot, projectionAt } from "@/modules/payments";

import type {
  PublicListingCardProjection,
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
const DEFAULT_LIMIT = 12;
const MAXIMUM_LIMIT = 24;

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
  });
}

function encodeCursor(cursor: PublicSearchCursor, fingerprint: string): string {
  return Buffer.from(
    JSON.stringify([
      cursor.startsAt.toISOString(),
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
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string" ||
      typeof parsed[2] !== "string" ||
      !PUBLIC_ID.test(parsed[1]) ||
      parsed[2] !== fingerprint
    ) {
      throw new PublicSearchCursorError();
    }
    const startsAt = new Date(parsed[0]);
    if (Number.isNaN(startsAt.getTime())) throw new PublicSearchCursorError();
    return { startsAt, publicId: parsed[1] };
  } catch {
    throw new PublicSearchCursorError();
  }
}

function cardProjection(
  source: PublicSearchSourceRecord,
  now: Date,
): PublicListingCardProjection {
  const snapshot = parsePublicationSnapshot(source.snapshot);
  const projection = projectionAt(snapshot, now);
  if (
    projection.path !== source.canonicalPath ||
    projection.eventType !== source.eventType
  ) {
    throw new Error("The publication projection does not match its authority");
  }
  const address = projection.address;
  return {
    id: source.publicId,
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
          ? address.label
          : `${address.city}, ${address.region}`,
      city: address.city,
      region: address.region,
    },
    coverPhotoUrl: projection.coverPhotoUrl,
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
    });
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      schema: "public-search-v1",
      criteria,
      items: visible.map((row) => cardProjection(row, now)),
      pageInfo: {
        hasNext: rows.length > limit,
        nextCursor:
          rows.length > limit && last
            ? encodeCursor(
                {
                  startsAt: last.startsAt,
                  publicId: last.publicId,
                },
                fingerprint,
              )
            : null,
      },
    };
  }
}
