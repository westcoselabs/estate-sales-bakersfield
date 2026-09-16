import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type { PublicSearchRepository } from "../application/ports";
import { APPROXIMATE_LOCATION_GRID_SCALE } from "../domain/approximate-location";

interface PublicSearchRow {
  readonly sourceKind: string;
  readonly publicId: string;
  readonly canonicalPath: string;
  readonly snapshot: unknown | null;
  readonly eventType: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly title: string | null;
  readonly localStartsAt: string | null;
  readonly localEndsAt: string | null;
  readonly timezone: string | null;
  readonly privacyMode: string | null;
  readonly city: string;
  readonly region: string;
  readonly sourceLabel: string | null;
  readonly coverPhotoUrl: string | null;
  readonly latitude: number | string | null;
  readonly longitude: number | string | null;
  readonly confirmationStatus: "UNCONFIRMED" | "CONFIRMED";
  readonly publicZone: string;
}

type SearchInput = Parameters<PublicSearchRepository["search"]>[0];

function pagePredicate(input: SearchInput, source: "ORGANIZER" | "EXTERNAL") {
  const organizer = source === "ORGANIZER";
  const startsAt = organizer
    ? Prisma.sql`search_document."starts_at"`
    : Prisma.sql`listing."starts_at"`;
  const endsAt = organizer
    ? Prisma.sql`search_document."ends_at"`
    : Prisma.sql`listing."ends_at"`;
  const publicId = organizer
    ? Prisma.sql`search_document."public_id"`
    : Prisma.sql`listing."public_id"`;
  const city = organizer
    ? Prisma.sql`search_document."city"`
    : Prisma.sql`location."city"`;
  const region = organizer
    ? Prisma.sql`search_document."region"`
    : Prisma.sql`location."region"`;
  const dateRange = !input.range
    ? Prisma.sql`TRUE`
    : organizer
      ? Prisma.sql`(
          CASE WHEN jsonb_array_length(COALESCE(COALESCE(source_event."published_snapshot", publication."snapshot") -> 'projection' -> 'scheduleDays', '[]'::jsonb)) > 0
          THEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(source_event."published_snapshot", publication."snapshot") -> 'projection' -> 'scheduleDays') AS sale_day
            WHERE (sale_day ->> 'startsAt')::timestamptz < ${input.range.endsAt}
              AND (sale_day ->> 'endsAt')::timestamptz > ${input.range.startsAt}
          )
          ELSE (${startsAt} < ${input.range.endsAt} AND ${endsAt} > ${input.range.startsAt}) END
        )`
      : Prisma.sql`(${startsAt} < ${input.range.endsAt} AND ${endsAt} > ${input.range.startsAt})`;
  return Prisma.sql`
    ${endsAt} > ${input.activeAfter}
    AND ${city} = ${input.location.city} AND ${region} = ${input.location.region}
    AND ${dateRange}
    AND ${
      input.cursor
        ? Prisma.sql`(${startsAt}, ${source}::text, ${publicId}::text) >
      (${input.cursor.startsAt}::timestamptz, ${input.cursor.sourceKind}::text, ${input.cursor.publicId}::text)`
        : Prisma.sql`TRUE`
    }
  `;
}

function publicBoundsPredicate(
  input: SearchInput,
  source: "organizer" | "external",
) {
  const bounds = input.bounds;
  if (!bounds) return Prisma.sql`TRUE`;
  const exact =
    source === "organizer"
      ? Prisma.sql`(search_document."privacy_mode" = 'EXACT_ADDRESS' OR
        (search_document."privacy_mode" = 'HIDDEN_UNTIL_START' AND
          COALESCE((COALESCE(source_event."published_snapshot", publication."snapshot") ->> 'addressRevealAt')::timestamptz, search_document."starts_at") <= ${input.activeAfter}))`
      : Prisma.sql`(listing."privacy_mode" = 'EXACT_ADDRESS' OR
        (listing."privacy_mode" = 'HIDDEN_UNTIL_START' AND listing."starts_at" <= ${input.activeAfter}))`;
  const includesPublicZone =
    bounds.west <= -119.018712 &&
    bounds.east >= -119.018712 &&
    bounds.south <= 35.373292 &&
    bounds.north >= 35.373292;
  // The same fixed cell used by the public marker is also the only protected
  // position used for viewport filtering. Private bounds would allow callers to
  // recover a house's coordinates by repeatedly narrowing a search rectangle.
  const confirmed = Prisma.sql`(location."confirmation_status" = 'CONFIRMED'
    AND location."longitude" IS NOT NULL AND location."latitude" IS NOT NULL)`;
  const approximateLongitude = Prisma.sql`((FLOOR(location."longitude" * ${APPROXIMATE_LOCATION_GRID_SCALE}) + 0.5) / ${APPROXIMATE_LOCATION_GRID_SCALE})`;
  const approximateLatitude = Prisma.sql`((FLOOR(location."latitude" * ${APPROXIMATE_LOCATION_GRID_SCALE}) + 0.5) / ${APPROXIMATE_LOCATION_GRID_SCALE})`;
  return Prisma.sql`(
    (${exact} AND location."confirmation_status" = 'CONFIRMED'
      AND location."coordinates"::public.geometry OPERATOR(public.&&) public.ST_MakeEnvelope(
        ${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)
      AND location."longitude" BETWEEN ${bounds.west} AND ${bounds.east}
      AND location."latitude" BETWEEN ${bounds.south} AND ${bounds.north})
    OR (NOT ${exact} AND location."public_zone" = 'bakersfield' AND (
      (${confirmed} AND ${approximateLongitude} BETWEEN ${bounds.west} AND ${bounds.east}
        AND ${approximateLatitude} BETWEEN ${bounds.south} AND ${bounds.north})
      OR (NOT ${confirmed} AND ${includesPublicZone})
    ))
  )`;
}

export class PrismaPublicSearchRepository implements PublicSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(
    input: Parameters<PublicSearchRepository["search"]>[0],
  ): Promise<Awaited<ReturnType<PublicSearchRepository["search"]>>> {
    const limit = Math.min(Math.max(input.limit, 1), 25);
    const rows = await this.prisma.$queryRaw<PublicSearchRow[]>(Prisma.sql`
      WITH public_results AS (
        (SELECT
          'ORGANIZER'::text AS "sourceKind",
          search_document."public_id" AS "publicId",
          publication."canonical_path" AS "canonicalPath",
          COALESCE(source_event."published_snapshot", publication."snapshot") AS "snapshot",
          search_document."event_type"::text AS "eventType",
          search_document."starts_at" AS "startsAt",
          search_document."ends_at" AS "endsAt",
          NULL::text AS "title",
          NULL::text AS "localStartsAt",
          NULL::text AS "localEndsAt",
          NULL::text AS "timezone",
          search_document."privacy_mode"::text AS "privacyMode",
          search_document."city" AS "city",
          search_document."region" AS "region",
          NULL::text AS "sourceLabel",
          NULL::text AS "coverPhotoUrl",
          location."latitude" AS "latitude",
          location."longitude" AS "longitude",
          location."confirmation_status" AS "confirmationStatus",
          location."public_zone" AS "publicZone"
        FROM "event_publications" AS publication
        INNER JOIN "publication_search_documents" AS search_document
          ON search_document."publication_id" = publication."id"
        INNER JOIN "events" AS source_event
          ON source_event."id" = publication."event_id"
        INNER JOIN "organizer_profiles" AS source_organizer
          ON source_organizer."id" = source_event."organizer_id"
        INNER JOIN "users" AS source_user
          ON source_user."id" = source_organizer."user_id"
        INNER JOIN "event_locations" AS location
          ON location."event_id" = source_event."id"
        WHERE source_event."canceled_at" IS NULL
          AND source_event."deleted_at" IS NULL
          AND source_event."removed_at" IS NULL
          AND source_user."status" = 'ACTIVE'
          AND (${input.eventType}::"event_type" IS NULL
            OR search_document."event_type" = ${input.eventType}::"event_type")
          AND ${publicBoundsPredicate(input, "organizer")}
          AND ${pagePredicate(input, "ORGANIZER")}
        ORDER BY search_document."starts_at", search_document."public_id"
        LIMIT ${limit})

        UNION ALL

        (SELECT
          'EXTERNAL'::text AS "sourceKind",
          listing."public_id" AS "publicId",
          listing."canonical_path" AS "canonicalPath",
          NULL::jsonb AS "snapshot",
          listing."event_type"::text AS "eventType",
          listing."starts_at" AS "startsAt",
          listing."ends_at" AS "endsAt",
          listing."title" AS "title",
          listing."local_starts_at" AS "localStartsAt",
          listing."local_ends_at" AS "localEndsAt",
          listing."timezone" AS "timezone",
          listing."privacy_mode"::text AS "privacyMode",
          location."city" AS "city",
          location."region" AS "region",
          listing."attribution" ->> 'sourceName' AS "sourceLabel",
          NULL::text AS "coverPhotoUrl",
          location."latitude" AS "latitude",
          location."longitude" AS "longitude",
          location."confirmation_status" AS "confirmationStatus",
          location."public_zone" AS "publicZone"
        FROM "external_listings" AS listing
        INNER JOIN "external_listing_locations" AS location
          ON location."listing_id" = listing."id"
        INNER JOIN "listing_source_records" AS source_record
          ON source_record."id" = listing."primary_source_record_id"
        WHERE listing."status" = 'PUBLISHED'
          AND (${input.eventType}::"event_type" IS NULL
            OR listing."event_type" = ${input.eventType}::"event_type")
          AND listing."ends_at" > ${input.activeAfter}
          AND listing."removed_at" IS NULL
          AND source_record."linked_event_id" IS NULL
          AND ${publicBoundsPredicate(input, "external")}
          AND ${pagePredicate(input, "EXTERNAL")}
        ORDER BY listing."starts_at", listing."public_id"
        LIMIT ${limit})
      )
      SELECT
        result."sourceKind",
        result."publicId",
        result."canonicalPath",
        result."snapshot",
        result."eventType",
        result."startsAt",
        result."endsAt",
        result."title",
        result."localStartsAt",
        result."localEndsAt",
        result."timezone",
        result."privacyMode",
        result."city",
        result."region",
        result."sourceLabel",
        result."coverPhotoUrl",
        result."latitude",
        result."longitude",
        result."confirmationStatus",
        result."publicZone"
      FROM public_results AS result
      ORDER BY
        result."startsAt" ASC,
        result."sourceKind" ASC,
        result."publicId" ASC
      LIMIT ${limit}
    `);

    return rows.map((row) => {
      if (row.eventType !== "ESTATE_SALE" && row.eventType !== "YARD_SALE") {
        throw new Error("The public listing contains an unsupported sale type");
      }
      const base = {
        publicId: row.publicId,
        canonicalPath: row.canonicalPath,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        eventType: row.eventType,
        location: {
          latitude: row.latitude === null ? null : Number(row.latitude),
          longitude: row.longitude === null ? null : Number(row.longitude),
          confirmationStatus: row.confirmationStatus,
          publicZone: row.publicZone,
        },
      } as const;

      if (row.sourceKind === "ORGANIZER") {
        if (row.snapshot === null) {
          throw new Error("The organizer publication snapshot is missing");
        }
        return {
          ...base,
          sourceKind: "ORGANIZER" as const,
          sourceLabel: null,
          snapshot: row.snapshot,
        };
      }
      if (
        row.sourceKind !== "EXTERNAL" ||
        row.title === null ||
        row.localStartsAt === null ||
        row.localEndsAt === null ||
        row.timezone === null ||
        (row.privacyMode !== "EXACT_ADDRESS" &&
          row.privacyMode !== "APPROXIMATE_LOCATION" &&
          row.privacyMode !== "HIDDEN_UNTIL_START") ||
        row.sourceLabel === null
      ) {
        throw new Error("The external public listing projection is incomplete");
      }
      return {
        ...base,
        sourceKind: "EXTERNAL" as const,
        sourceLabel: row.sourceLabel,
        content: {
          title: row.title,
          localStartsAt: row.localStartsAt,
          localEndsAt: row.localEndsAt,
          timezone: row.timezone,
          privacyMode: row.privacyMode,
          city: row.city,
          region: row.region,
          coverPhotoUrl: row.coverPhotoUrl,
        },
      };
    });
  }
}
