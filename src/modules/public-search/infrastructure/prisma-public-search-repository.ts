import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type { PublicSearchRepository } from "../application/ports";

interface PublicSearchRow {
  readonly publicId: string;
  readonly canonicalPath: string;
  readonly snapshot: unknown;
  readonly eventType: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
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
    const projection = Prisma.sql`publication."snapshot" -> 'projection'`;
    const startsAt = Prisma.sql`(${projection} ->> 'startsAt')::timestamptz`;
    const endsAt = Prisma.sql`(${projection} ->> 'endsAt')::timestamptz`;
    const eventType = Prisma.sql`${projection} ->> 'eventType'`;
    const address = Prisma.sql`${projection} -> 'address'`;
    const privacyMode = Prisma.sql`publication."snapshot" ->> 'privacyMode'`;
    const publicLongitude = Prisma.sql`
      CASE
        WHEN ${privacyMode} = 'EXACT_ADDRESS' THEN location."longitude"
        ELSE -119.018712
      END`;
    const publicLatitude = Prisma.sql`
      CASE
        WHEN ${privacyMode} = 'EXACT_ADDRESS' THEN location."latitude"
        ELSE 35.373292
      END`;
    const limit = Math.min(Math.max(input.limit, 1), 25);

    const rows = await this.prisma.$queryRaw<PublicSearchRow[]>(Prisma.sql`
      SELECT
        publication."public_id" AS "publicId",
        publication."canonical_path" AS "canonicalPath",
        publication."snapshot" AS "snapshot",
        ${eventType} AS "eventType",
        ${startsAt} AS "startsAt",
        ${endsAt} AS "endsAt"
        , location."latitude" AS "latitude"
        , location."longitude" AS "longitude"
        , location."confirmation_status" AS "confirmationStatus"
        , location."public_zone" AS "publicZone"
      FROM "event_publications" AS publication
      INNER JOIN "events" AS source_event ON source_event."id" = publication."event_id"
      INNER JOIN "event_locations" AS location ON location."event_id" = source_event."id"
      WHERE source_event."canceled_at" IS NULL
        AND source_event."deleted_at" IS NULL
        AND source_event."removed_at" IS NULL
        AND ${endsAt} > ${input.activeAfter}
        AND (${input.eventType}::text IS NULL OR ${eventType} = ${input.eventType}::text)
        AND ${address} ->> 'city' = ${input.location.city}
        AND ${address} ->> 'region' = ${input.location.region}
        AND (
          ${input.bounds?.west ?? null}::numeric IS NULL
          OR (
            ${publicLongitude} BETWEEN ${input.bounds?.west ?? null} AND ${input.bounds?.east ?? null}
            AND ${publicLatitude} BETWEEN ${input.bounds?.south ?? null} AND ${input.bounds?.north ?? null}
          )
        )
        AND (
          ${input.range?.endsAt ?? null}::timestamptz IS NULL
          OR (
            ${startsAt} < ${input.range?.endsAt ?? null}::timestamptz
            AND ${endsAt} > ${input.range?.startsAt ?? null}::timestamptz
          )
        )
        AND (
          ${input.cursor?.startsAt ?? null}::timestamptz IS NULL
          OR ${startsAt} > ${input.cursor?.startsAt ?? null}::timestamptz
          OR (
            ${startsAt} = ${input.cursor?.startsAt ?? null}::timestamptz
            AND publication."public_id" > ${input.cursor?.publicId ?? null}::text
          )
        )
      ORDER BY ${startsAt} ASC, publication."public_id" ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => {
      if (row.eventType !== "ESTATE_SALE" && row.eventType !== "YARD_SALE") {
        throw new Error("The publication contains an unsupported sale type");
      }
      return {
        publicId: row.publicId,
        canonicalPath: row.canonicalPath,
        snapshot: row.snapshot,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        eventType: row.eventType,
        location: {
          latitude: row.latitude === null ? null : Number(row.latitude),
          longitude: row.longitude === null ? null : Number(row.longitude),
          confirmationStatus: row.confirmationStatus,
          publicZone: row.publicZone,
        },
      };
    });
  }
}
