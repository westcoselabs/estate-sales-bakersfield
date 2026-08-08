import "server-only";

import { Prisma } from "@/generated/prisma/client";

import { probableDuplicateReasons } from "../domain/duplicates";
import { ListingImportConflictError } from "../domain/errors";
import { normalizeComparableText } from "../domain/normalization";
import type {
  ListingDuplicateComparable,
  ListingProbableDuplicateReason,
} from "../domain/types";

const MAXIMUM_DUPLICATE_TARGET_PAIRS = 20_000;
const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

type Transaction = Prisma.TransactionClient;

interface DuplicateTargetRow {
  readonly candidate_id: string;
  readonly id: string;
  readonly title: string | null;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly normalized_address: string | null;
  readonly postal_code: string | null;
  readonly latitude: Prisma.Decimal | null;
  readonly longitude: Prisma.Decimal | null;
  readonly confirmation_status: string | null;
}

export interface PrismaDuplicateCandidate extends ListingDuplicateComparable {
  readonly candidateId: string;
}

export interface PrismaDuplicateTarget {
  readonly targetKind: "EVENT" | "EXTERNAL_LISTING";
  readonly targetId: string;
  readonly reasons: readonly ListingProbableDuplicateReason[];
}

function comparableTarget(row: DuplicateTargetRow): ListingDuplicateComparable {
  const confirmed =
    row.confirmation_status === "CONFIRMED" &&
    row.latitude !== null &&
    row.longitude !== null;
  return {
    normalizedTitle: normalizeComparableText(row.title ?? ""),
    normalizedAddress: normalizeComparableText(row.normalized_address ?? ""),
    normalizedPostalCode: normalizeComparableText(row.postal_code ?? ""),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    confirmedPoint: confirmed
      ? {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        }
      : null,
  };
}

export async function findPrismaDuplicateTargets(
  transaction: Transaction,
  candidates: readonly PrismaDuplicateCandidate[],
): Promise<ReadonlyMap<string, readonly PrismaDuplicateTarget[]>> {
  if (candidates.length === 0) return new Map();
  const windowsJson = JSON.stringify(
    candidates.map((candidate) => ({
      candidate_id: candidate.candidateId,
      starts_at: candidate.startsAt.toISOString(),
      ends_at: candidate.endsAt.toISOString(),
      lower_start: new Date(
        candidate.startsAt.getTime() - ONE_DAY_MILLISECONDS,
      ).toISOString(),
      upper_start: new Date(
        candidate.startsAt.getTime() + ONE_DAY_MILLISECONDS,
      ).toISOString(),
    })),
  );
  const windows = Prisma.sql`
    SELECT *
    FROM jsonb_to_recordset(${windowsJson}::jsonb) AS w(
      candidate_id uuid,
      starts_at timestamptz,
      ends_at timestamptz,
      lower_start timestamptz,
      upper_start timestamptz
    )
  `;
  const events = await transaction.$queryRaw<DuplicateTargetRow[]>(Prisma.sql`
    WITH candidate_windows AS (${windows})
    SELECT
      w.candidate_id::text AS "candidate_id",
      e."id", e."title", e."starts_at", e."ends_at",
      l."normalized_address", l."postal_code", l."latitude", l."longitude",
      l."confirmation_status"::text AS "confirmation_status"
    FROM candidate_windows w
    JOIN "events" e ON (
      (e."starts_at" < w.ends_at AND w.starts_at < e."ends_at")
      OR e."starts_at" BETWEEN w.lower_start AND w.upper_start
    )
    LEFT JOIN "event_locations" l ON l."event_id" = e."id"
    WHERE e."title" IS NOT NULL
      AND e."starts_at" IS NOT NULL
      AND e."ends_at" IS NOT NULL
      AND e."deleted_at" IS NULL
      AND e."canceled_at" IS NULL
      AND e."removed_at" IS NULL
    ORDER BY w.candidate_id, e."id"
    LIMIT ${MAXIMUM_DUPLICATE_TARGET_PAIRS + 1}
  `);
  const externalListings = await transaction.$queryRaw<DuplicateTargetRow[]>(
    Prisma.sql`
      WITH candidate_windows AS (${windows})
      SELECT
        w.candidate_id::text AS "candidate_id",
        e."id", e."title", e."starts_at", e."ends_at",
        l."normalized_address", l."postal_code", l."latitude", l."longitude",
        l."confirmation_status"::text AS "confirmation_status"
      FROM candidate_windows w
      JOIN "external_listings" e ON (
        (e."starts_at" < w.ends_at AND w.starts_at < e."ends_at")
        OR e."starts_at" BETWEEN w.lower_start AND w.upper_start
      )
      LEFT JOIN "external_listing_locations" l ON l."listing_id" = e."id"
      WHERE e."status" <> 'REMOVED'::"external_listing_status"
      ORDER BY w.candidate_id, e."id"
      LIMIT ${MAXIMUM_DUPLICATE_TARGET_PAIRS + 1}
    `,
  );
  if (
    events.length > MAXIMUM_DUPLICATE_TARGET_PAIRS ||
    externalListings.length > MAXIMUM_DUPLICATE_TARGET_PAIRS
  ) {
    throw new ListingImportConflictError(
      "IMPORT_CONFLICT",
      "The duplicate comparison scope is too broad to process safely.",
    );
  }

  const candidateById = new Map(
    candidates.map((candidate) => [candidate.candidateId, candidate] as const),
  );
  const result = new Map<string, PrismaDuplicateTarget[]>();
  const addTargets = (
    rows: readonly DuplicateTargetRow[],
    targetKind: "EVENT" | "EXTERNAL_LISTING",
  ) => {
    for (const target of rows) {
      const candidate = candidateById.get(target.candidate_id);
      if (!candidate) continue;
      const reasons = probableDuplicateReasons(
        candidate,
        comparableTarget(target),
      );
      if (reasons.length === 0) continue;
      const current = result.get(target.candidate_id) ?? [];
      current.push({ targetKind, targetId: target.id, reasons });
      result.set(target.candidate_id, current);
    }
  };
  addTargets(events, "EVENT");
  addTargets(externalListings, "EXTERNAL_LISTING");
  return result;
}
