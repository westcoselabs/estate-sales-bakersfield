import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type { PublicSearchRepository } from "../application/ports";

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

export class PrismaPublicSearchRepository implements PublicSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(
    input: Parameters<PublicSearchRepository["search"]>[0],
  ): Promise<Awaited<ReturnType<PublicSearchRepository["search"]>>> {
    const limit = Math.min(Math.max(input.limit, 1), 25);
    const cursorSourceKind = input.cursor?.sourceKind ?? null;

    const rows = await this.prisma.$queryRaw<PublicSearchRow[]>(Prisma.sql`
      WITH public_results AS (
        SELECT
          'ORGANIZER'::text AS "sourceKind",
          publication."public_id" AS "publicId",
          publication."canonical_path" AS "canonicalPath",
          publication."snapshot" AS "snapshot",
          publication."snapshot" -> 'projection' ->> 'eventType' AS "eventType",
          (publication."snapshot" -> 'projection' ->> 'startsAt')::timestamptz AS "startsAt",
          (publication."snapshot" -> 'projection' ->> 'endsAt')::timestamptz AS "endsAt",
          NULL::text AS "title",
          NULL::text AS "localStartsAt",
          NULL::text AS "localEndsAt",
          NULL::text AS "timezone",
          publication."snapshot" ->> 'privacyMode' AS "privacyMode",
          publication."snapshot" -> 'projection' -> 'address' ->> 'city' AS "city",
          publication."snapshot" -> 'projection' -> 'address' ->> 'region' AS "region",
          NULL::text AS "sourceLabel",
          NULL::text AS "coverPhotoUrl",
          location."latitude" AS "latitude",
          location."longitude" AS "longitude",
          location."confirmation_status" AS "confirmationStatus",
          location."public_zone" AS "publicZone",
          CASE
            WHEN publication."snapshot" ->> 'privacyMode' = 'EXACT_ADDRESS'
              OR (
                publication."snapshot" ->> 'privacyMode' = 'HIDDEN_UNTIL_START'
                AND (
                  publication."snapshot" -> 'projection' ->> 'startsAt'
                )::timestamptz <= ${input.activeAfter}
              )
              THEN location."longitude"
            ELSE -119.018712
          END AS "publicLongitude",
          CASE
            WHEN publication."snapshot" ->> 'privacyMode' = 'EXACT_ADDRESS'
              OR (
                publication."snapshot" ->> 'privacyMode' = 'HIDDEN_UNTIL_START'
                AND (
                  publication."snapshot" -> 'projection' ->> 'startsAt'
                )::timestamptz <= ${input.activeAfter}
              )
              THEN location."latitude"
            ELSE 35.373292
          END AS "publicLatitude"
        FROM "event_publications" AS publication
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

        UNION ALL

        SELECT
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
          location."public_zone" AS "publicZone",
          CASE
            WHEN listing."privacy_mode" = 'EXACT_ADDRESS'
              OR (
                listing."privacy_mode" = 'HIDDEN_UNTIL_START'
                AND listing."starts_at" <= ${input.activeAfter}
              )
              THEN location."longitude"
            ELSE -119.018712
          END AS "publicLongitude",
          CASE
            WHEN listing."privacy_mode" = 'EXACT_ADDRESS'
              OR (
                listing."privacy_mode" = 'HIDDEN_UNTIL_START'
                AND listing."starts_at" <= ${input.activeAfter}
              )
              THEN location."latitude"
            ELSE 35.373292
          END AS "publicLatitude"
        FROM "external_listings" AS listing
        INNER JOIN "external_listing_locations" AS location
          ON location."listing_id" = listing."id"
        INNER JOIN "listing_source_records" AS source_record
          ON source_record."id" = listing."primary_source_record_id"
        WHERE listing."status" = 'PUBLISHED'
          AND listing."ends_at" > ${input.activeAfter}
          AND source_record."linked_event_id" IS NULL
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
      WHERE result."endsAt" > ${input.activeAfter}
        AND (
          ${input.eventType}::text IS NULL
          OR result."eventType" = ${input.eventType}::text
        )
        AND result."city" = ${input.location.city}
        AND result."region" = ${input.location.region}
        AND (
          ${input.bounds?.west ?? null}::numeric IS NULL
          OR (
            result."publicLongitude" BETWEEN ${input.bounds?.west ?? null} AND ${input.bounds?.east ?? null}
            AND result."publicLatitude" BETWEEN ${input.bounds?.south ?? null} AND ${input.bounds?.north ?? null}
          )
        )
        AND (
          ${input.range?.endsAt ?? null}::timestamptz IS NULL
          OR (
            result."startsAt" < ${input.range?.endsAt ?? null}::timestamptz
            AND result."endsAt" > ${input.range?.startsAt ?? null}::timestamptz
          )
        )
        AND (
          ${input.cursor?.startsAt ?? null}::timestamptz IS NULL
          OR result."startsAt" > ${input.cursor?.startsAt ?? null}::timestamptz
          OR (
            result."startsAt" = ${input.cursor?.startsAt ?? null}::timestamptz
            AND result."sourceKind" > ${cursorSourceKind}::text
          )
          OR (
            result."startsAt" = ${input.cursor?.startsAt ?? null}::timestamptz
            AND result."sourceKind" = ${cursorSourceKind}::text
            AND result."publicId" > ${input.cursor?.publicId ?? null}::text
          )
        )
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
