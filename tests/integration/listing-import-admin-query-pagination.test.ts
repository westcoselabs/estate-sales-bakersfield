import { createHash, randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  ListingImportAdminCursor,
  ListingImportAdminRepositoryLandingPage,
  ListingImportAdminView,
} from "@/modules/listing-imports/application/admin-query-ports";
import { reviewedCandidatePayloadSchema } from "@/modules/listing-imports/application/review-schemas";
import { futurePublicPath, eventSlug } from "@/modules/events/domain/slug";
import { PrismaListingImportAdminQueryRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-import-admin-query-repository";

import { createIntegrationClient } from "./support/database";
import {
  createListingImportReviewHarness,
  type ListingImportReviewHarness,
} from "./support/listing-import-review-fixtures";

const prisma = createIntegrationClient();
const queries = new PrismaListingImportAdminQueryRepository(prisma);
const PAGE_SIZE = 2;
const FIXTURE_COUNT = 5;
const TIED_BATCH_AT = new Date("2099-01-01T12:00:00.000Z");
const TIED_LISTING_AT = new Date("2099-02-01T12:00:00.000Z");
const TIED_CREDENTIAL_AT = new Date("2099-03-01T12:00:00.000Z");

let harness: ListingImportReviewHarness;
let sourceId: string;
const candidateIds: string[] = [];
const batchIds: string[] = [];
const listingIds: string[] = [];
const credentialIds: string[] = [];

function sortedIds(ids: readonly string[], direction: "asc" | "desc") {
  const sorted = [...ids].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return direction === "asc" ? sorted : sorted.reverse();
}

function assertNextMatchesLast(
  active: ListingImportAdminRepositoryLandingPage,
): void {
  const next = active.page.next;
  if (!next) return;
  switch (active.view) {
    case "candidates": {
      const last = active.page.rows.at(-1);
      expect(last).toBeDefined();
      expect(next).toEqual({ at: last!.startsAt, id: last!.id });
      return;
    }
    case "batches": {
      const last = active.page.rows.at(-1);
      expect(last).toBeDefined();
      expect(next).toEqual({ at: last!.createdAt, id: last!.id });
      return;
    }
    case "listings": {
      const last = active.page.rows.at(-1);
      expect(last).toBeDefined();
      expect(next).toEqual({ at: last!.publishedAt, id: last!.id });
      return;
    }
    case "credentials": {
      const last = active.page.rows.at(-1);
      expect(last).toBeDefined();
      expect(next).toEqual({ at: last!.createdAt, id: last!.id });
      return;
    }
  }
}

async function collectFixtureOrder(
  view: ListingImportAdminView,
  fixtures: readonly string[],
): Promise<{ readonly order: readonly string[]; readonly pages: number }> {
  const fixtureSet = new Set(fixtures);
  const observed = new Set<string>();
  const fixtureOrder: string[] = [];
  let cursor: ListingImportAdminCursor | null = null;
  let pages = 0;

  while (fixtureOrder.length < fixtureSet.size) {
    pages += 1;
    if (pages > 250) {
      throw new Error(`Pagination did not reach all ${view} fixtures.`);
    }
    const result = await queries.landing({ view, cursor, limit: PAGE_SIZE });
    expect(result.active.view).toBe(view);
    expect(result.active.page.rows.length).toBeLessThanOrEqual(PAGE_SIZE);
    assertNextMatchesLast(result.active);
    for (const row of result.active.page.rows) {
      expect(observed.has(row.id)).toBe(false);
      observed.add(row.id);
      if (fixtureSet.has(row.id)) fixtureOrder.push(row.id);
    }
    if (fixtureOrder.length === fixtureSet.size) break;
    cursor = result.active.page.next;
    if (!cursor) break;
  }

  expect(new Set(fixtureOrder).size).toBe(fixtures.length);
  expect(fixtureOrder).toHaveLength(fixtures.length);
  return { order: fixtureOrder, pages };
}

async function seedPublishedListing(
  candidateId: string,
  publishedAt: Date,
): Promise<string> {
  return prisma.$transaction(async (transaction) => {
    const candidate =
      await transaction.listingImportCandidate.findUniqueOrThrow({
        where: { id: candidateId },
        include: { sourceRecord: { include: { source: true } } },
      });
    const payload = reviewedCandidatePayloadSchema.parse(
      candidate.currentPayload,
    );
    if (
      candidate.locationConfirmationStatus !== "CONFIRMED" ||
      candidate.latitude === null ||
      candidate.longitude === null ||
      candidate.locationConfirmedByUserId === null ||
      candidate.locationConfirmedAt === null ||
      !candidate.locationProviderPlaceId ||
      !candidate.locationProviderName ||
      !payload.addressLine1 ||
      !payload.locationResolution
    ) {
      throw new Error(
        "Published pagination fixture requires a confirmed location.",
      );
    }
    const unresolved = await transaction.listingDuplicateMatch.count({
      where: { candidateId, resolution: "UNRESOLVED" },
    });
    if (unresolved !== 0) {
      throw new Error(
        "Published pagination fixture unexpectedly matched a duplicate.",
      );
    }

    await transaction.listingImportCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "APPROVED",
        version: { increment: 1 },
        reviewedByUserId: harness.administratorId,
        reviewedAt: publishedAt,
        reviewReason: null,
        updatedAt: publishedAt,
      },
    });
    const listingId = randomUUID();
    const publicId = randomBytes(6).toString("hex");
    const slug = eventSlug(payload.title);
    const listing = await transaction.externalListing.create({
      data: {
        id: listingId,
        candidateId: candidate.id,
        primarySourceRecordId: candidate.sourceRecordId,
        publicId,
        slug,
        canonicalPath: futurePublicPath({
          eventType: payload.eventType,
          slug,
          publicId,
        }),
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description,
        localStartsAt: payload.localStartsAt,
        localEndsAt: payload.localEndsAt,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        timezone: payload.timezone,
        privacyMode: payload.privacyMode,
        status: "PUBLISHED",
        version: 1,
        attribution: {
          schema: "external-listing-attribution.v1",
          sourceId: candidate.sourceRecord.source.id,
          sourceKey: candidate.sourceRecord.source.key,
          sourceName: candidate.sourceRecord.source.name,
          sourceListingId: candidate.sourceRecord.sourceListingId,
          sourceUrl: candidate.sourceRecord.canonicalSourceUrl,
        },
        publishedAt,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
      select: { id: true },
    });
    await transaction.$executeRaw`
      INSERT INTO "external_listing_locations" (
        "id", "listing_id", "address_line_1", "address_line_2", "city",
        "region", "postal_code", "country_code", "normalized_address",
        "latitude", "longitude", "coordinates", "timezone",
        "provider_place_id", "provider_name", "provider_version",
        "provider_attribution", "resolution_source", "confirmation_status",
        "confirmed_by_user_id", "confirmed_at", "public_zone", "precision",
        "confidence", "validation_status", "created_at", "updated_at"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${listing.id}::uuid,
        ${payload.addressLine1},
        ${payload.addressLine2},
        ${payload.city},
        ${payload.region},
        ${payload.postalCode},
        ${payload.countryCode},
        ${payload.normalizedAddress},
        ${Number(candidate.latitude)},
        ${Number(candidate.longitude)},
        ST_SetSRID(
          ST_MakePoint(${Number(candidate.longitude)}, ${Number(candidate.latitude)}),
          4326
        )::geography,
        ${payload.timezone},
        ${candidate.locationProviderPlaceId},
        ${candidate.locationProviderName},
        ${candidate.locationProviderVersion},
        ${candidate.locationProviderAttribution},
        'ADMIN_GEOCODING',
        'CONFIRMED',
        ${candidate.locationConfirmedByUserId}::uuid,
        ${candidate.locationConfirmedAt},
        'bakersfield',
        ${payload.locationResolution.precision},
        ${payload.locationResolution.confidence},
        CAST(${payload.locationResolution.validationStatus} AS "location_validation_status"),
        ${publishedAt},
        ${publishedAt}
      )
    `;
    return listing.id;
  });
}

beforeAll(async () => {
  harness = await createListingImportReviewHarness(prisma, {
    baseCalendarDate: "2100-01-01",
    importClock: () => TIED_BATCH_AT,
  });
  sourceId = (
    await prisma.listingImportSource.findUniqueOrThrow({
      where: { key: "fixture" },
      select: { id: true },
    })
  ).id;

  for (let index = 0; index < FIXTURE_COUNT; index += 1) {
    const fixture = harness.nextFixture(`Paged Candidate ${String(index)}`, {
      calendarDate: "2027-01-15",
    });
    const created = await harness.createCandidate(fixture);
    candidateIds.push(created.candidateId);
    batchIds.push(created.batchId);
  }

  const listingDates = [
    "2100-03-01",
    "2100-04-01",
    "2100-05-01",
    "2100-06-01",
    "2100-07-01",
  ];
  for (let index = 0; index < FIXTURE_COUNT; index += 1) {
    const fixture = harness.nextFixture(`Paged Listing ${String(index)}`, {
      calendarDate: listingDates[index]!,
    });
    const created = await harness.createCandidate(fixture);
    batchIds.push(created.batchId);
    await harness.confirmCandidate(created.candidateId);
    listingIds.push(
      await seedPublishedListing(created.candidateId, TIED_LISTING_AT),
    );
  }

  for (let index = 0; index < FIXTURE_COUNT; index += 1) {
    const nonce = randomBytes(8).toString("hex");
    const credential = await prisma.listingIngestionCredential.create({
      data: {
        sourceId,
        name: `Paged credential ${String(index)}`,
        tokenDigest: createHash("sha256")
          .update(`${nonce}-${randomUUID()}`, "utf8")
          .digest("hex"),
        displayPrefix: `esb_ing_pg${String(index)}${nonce.slice(0, 4)}`,
        createdByUserId: harness.administratorId,
        createdAt: TIED_CREDENTIAL_AT,
      },
      select: { id: true },
    });
    credentialIds.push(credential.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Prisma listing import admin keyset pagination", () => {
  it("paginates tied candidate starts by ascending UUID without duplicates", async () => {
    const result = await collectFixtureOrder("candidates", candidateIds);
    expect(result.pages).toBeGreaterThanOrEqual(3);
    expect(result.order).toEqual(sortedIds(candidateIds, "asc"));
  });

  it("paginates tied batch creation times by descending UUID without duplicates", async () => {
    const result = await collectFixtureOrder("batches", batchIds);
    expect(result.pages).toBeGreaterThanOrEqual(5);
    expect(result.order).toEqual(sortedIds(batchIds, "desc"));
  });

  it("paginates tied published listings by descending UUID without duplicates", async () => {
    const result = await collectFixtureOrder("listings", listingIds);
    expect(result.pages).toBeGreaterThanOrEqual(3);
    expect(result.order).toEqual(sortedIds(listingIds, "desc"));
  });

  it("paginates tied credentials by descending UUID without duplicates", async () => {
    const result = await collectFixtureOrder("credentials", credentialIds);
    expect(result.pages).toBeGreaterThanOrEqual(3);
    expect(result.order).toEqual(sortedIds(credentialIds, "desc"));
  });
});
