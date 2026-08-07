import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";

import { createIntegrationClient } from "./support/database";
import { testEmail, testRunId } from "./support/test-run";

const prisma = createIntegrationClient();

let administratorId: string;
let fixtureSourceId: string;
let organizerId: string;

const digest = (character: string): string => character.repeat(64);
const randomDigest = (): string =>
  `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
const publicId = (): string => randomUUID().replaceAll("-", "").slice(0, 12);
const unique = (label: string): string =>
  `${testRunId()}-${label}-${randomUUID().slice(0, 8)}`;

type BatchCounts = Readonly<{
  candidateRows?: number;
  invalidRows?: number;
  exactDuplicateRows?: number;
  sourceChangedRows?: number;
  identityConflictRows?: number;
}>;

async function insertBatch(
  transaction: Prisma.TransactionClient,
  batchId: string,
  counts: BatchCounts,
): Promise<void> {
  const candidateRows = counts.candidateRows ?? 0;
  const invalidRows = counts.invalidRows ?? 0;
  const exactDuplicateRows = counts.exactDuplicateRows ?? 0;
  const sourceChangedRows = counts.sourceChangedRows ?? 0;
  const identityConflictRows = counts.identityConflictRows ?? 0;
  const totalRows =
    candidateRows +
    invalidRows +
    exactDuplicateRows +
    sourceChangedRows +
    identityConflictRows;
  const rejectedRows = invalidRows + identityConflictRows;
  const status =
    rejectedRows === 0
      ? "COMPLETED"
      : rejectedRows === totalRows
        ? "REJECTED"
        : "PARTIAL";

  await transaction.$executeRaw`
    INSERT INTO "listing_import_batches" (
      "id",
      "source_id",
      "admin_actor_user_id",
      "transport",
      "contract_version",
      "parser_version",
      "ingestor_run_id",
      "ingestor_instance_id",
      "request_digest",
      "payload_digest",
      "status",
      "total_rows",
      "candidate_rows",
      "invalid_rows",
      "exact_duplicate_rows",
      "source_changed_rows",
      "identity_conflict_rows",
      "completed_at"
    ) VALUES (
      ${batchId}::UUID,
      ${fixtureSourceId}::UUID,
      ${administratorId}::UUID,
      'MANUAL_JSON',
      'listing-import.v1',
      'invariant-test@1.0.0',
      ${unique("run")},
      ${unique("instance")},
      ${digest("a")},
      ${digest("b")},
      CAST(${status} AS "listing_import_batch_status"),
      ${totalRows},
      ${candidateRows},
      ${invalidRows},
      ${exactDuplicateRows},
      ${sourceChangedRows},
      ${identityConflictRows},
      CURRENT_TIMESTAMP
    )
  `;
}

async function insertRow(
  transaction: Prisma.TransactionClient,
  input: Readonly<{
    id?: string;
    batchId: string;
    rowNumber?: number;
    sourceRecordId?: string | null;
    status:
      | "CANDIDATE_CREATED"
      | "INVALID"
      | "EXACT_DUPLICATE"
      | "SOURCE_CHANGED"
      | "IDENTITY_CONFLICT";
  }>,
): Promise<string> {
  const id = input.id ?? randomUUID();
  const invalid = input.status === "INVALID";

  await transaction.$executeRaw`
    INSERT INTO "listing_import_rows" (
      "id",
      "batch_id",
      "row_number",
      "source_record_id",
      "status",
      "input_json",
      "normalized_json",
      "validation_failures",
      "content_hash"
    ) VALUES (
      ${id}::UUID,
      ${input.batchId}::UUID,
      ${input.rowNumber ?? 1},
      ${input.sourceRecordId ?? null}::UUID,
      CAST(${input.status} AS "listing_import_row_status"),
      ${JSON.stringify({ fixture: true })}::JSONB,
      ${invalid ? null : JSON.stringify({ fixture: true })}::JSONB,
      ${JSON.stringify(invalid ? ["INVALID_FIXTURE"] : [])}::JSONB,
      ${invalid ? null : digest("c")}
    )
  `;

  return id;
}

async function sealBatch(
  transaction: Prisma.TransactionClient,
  batchId: string,
): Promise<void> {
  await transaction.$executeRaw`
    UPDATE "listing_import_batches"
    SET "sealed_at" = "completed_at"
    WHERE "id" = ${batchId}::UUID
  `;
}

async function createSourceRecord(): Promise<string> {
  const id = randomUUID();
  const sourceListingId = unique("source-record");
  await prisma.$executeRaw`
    INSERT INTO "listing_source_records" (
      "id",
      "source_id",
      "source_listing_id",
      "canonical_source_url",
      "first_seen_at",
      "last_seen_at",
      "last_content_hash",
      "updated_at"
    ) VALUES (
      ${id}::UUID,
      ${fixtureSourceId}::UUID,
      ${sourceListingId},
      ${`https://fixture.invalid/listings/${sourceListingId}`},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      ${digest("d")},
      CURRENT_TIMESTAMP
    )
  `;
  return id;
}

async function createPublishableCandidate(): Promise<{
  candidateId: string;
  sourceRecordId: string;
}> {
  const candidateId = randomUUID();
  const sourceRecordId = await createSourceRecord();
  const batchId = randomUUID();
  const rowId = randomUUID();

  await prisma.$transaction(async (transaction) => {
    await insertBatch(transaction, batchId, { candidateRows: 1 });
    await insertRow(transaction, {
      id: rowId,
      batchId,
      sourceRecordId,
      status: "CANDIDATE_CREATED",
    });
    await transaction.$executeRaw`
      INSERT INTO "listing_import_candidates" (
        "id",
        "source_record_id",
        "creation_observation_id",
        "latest_observation_id",
        "current_payload",
        "normalized_title",
        "normalized_city",
        "normalized_postal_code",
        "starts_at",
        "ends_at",
        "latitude",
        "longitude",
        "coordinates",
        "location_provider_place_id",
        "location_provider_name",
        "location_provider_version",
        "location_resolution_source",
        "location_confirmation_status",
        "location_confirmed_by_user_id",
        "location_confirmed_at",
        "status",
        "reviewed_by_user_id",
        "reviewed_at",
        "updated_at"
      ) VALUES (
        ${candidateId}::UUID,
        ${sourceRecordId}::UUID,
        ${rowId}::UUID,
        ${rowId}::UUID,
        ${JSON.stringify({ fixture: true })}::JSONB,
        'Fixture Estate Sale',
        'bakersfield',
        '93301',
        '2026-09-12T16:00:00.000Z'::TIMESTAMPTZ,
        '2026-09-13T22:00:00.000Z'::TIMESTAMPTZ,
        35.3733,
        -119.0187,
        ST_SetSRID(ST_MakePoint(-119.0187, 35.3733), 4326)::geography,
        'fixture-place',
        'fixture',
        '1',
        'ADMIN_GEOCODING',
        'CONFIRMED',
        ${administratorId}::UUID,
        CURRENT_TIMESTAMP,
        'APPROVED',
        ${administratorId}::UUID,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
    await sealBatch(transaction, batchId);
  });

  return { candidateId, sourceRecordId };
}

async function publishExternalListing(
  candidate: Readonly<{ candidateId: string; sourceRecordId: string }>,
  listingPublicId: string,
): Promise<string> {
  const listingId = randomUUID();
  const locationId = randomUUID();

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "external_listings" (
        "id",
        "candidate_id",
        "primary_source_record_id",
        "public_id",
        "slug",
        "canonical_path",
        "event_type",
        "title",
        "description",
        "local_starts_at",
        "local_ends_at",
        "starts_at",
        "ends_at",
        "timezone",
        "privacy_mode",
        "attribution",
        "published_at",
        "updated_at"
      ) VALUES (
        ${listingId}::UUID,
        ${candidate.candidateId}::UUID,
        ${candidate.sourceRecordId}::UUID,
        ${listingPublicId},
        'fixture-estate-sale',
        ${`/estate-sales/fixture-estate-sale-${listingPublicId}`},
        'ESTATE_SALE',
        'Fixture Estate Sale',
        'A complete fixture description for external listing invariant tests.',
        '2026-09-12T09:00',
        '2026-09-13T15:00',
        '2026-09-12T16:00:00.000Z'::TIMESTAMPTZ,
        '2026-09-13T22:00:00.000Z'::TIMESTAMPTZ,
        'America/Los_Angeles',
        'APPROXIMATE_LOCATION',
        ${JSON.stringify({ source: "fixture" })}::JSONB,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
    await transaction.$executeRaw`
      INSERT INTO "external_listing_locations" (
        "id",
        "listing_id",
        "address_line_1",
        "city",
        "region",
        "postal_code",
        "country_code",
        "normalized_address",
        "latitude",
        "longitude",
        "coordinates",
        "timezone",
        "provider_place_id",
        "provider_name",
        "provider_version",
        "resolution_source",
        "confirmation_status",
        "confirmed_by_user_id",
        "confirmed_at",
        "validation_status",
        "updated_at"
      ) VALUES (
        ${locationId}::UUID,
        ${listingId}::UUID,
        '101 Example Avenue',
        'Bakersfield',
        'CA',
        '93301',
        'US',
        '101 example avenue bakersfield ca 93301',
        35.3733,
        -119.0187,
        ST_SetSRID(ST_MakePoint(-119.0187, 35.3733), 4326)::geography,
        'America/Los_Angeles',
        'fixture-place',
        'fixture',
        '1',
        'ADMIN_GEOCODING',
        'CONFIRMED',
        ${administratorId}::UUID,
        CURRENT_TIMESTAMP,
        'VERIFIED',
        CURRENT_TIMESTAMP
      )
    `;
  });

  return listingId;
}

async function createEvent(eventPublicId: string) {
  return prisma.event.create({
    data: {
      organizerId,
      publicId: eventPublicId,
      slug: `fixture-${eventPublicId}`,
      eventType: "ESTATE_SALE",
    },
  });
}

beforeAll(async () => {
  const source = await prisma.listingImportSource.findUniqueOrThrow({
    where: { key: "fixture" },
    select: { id: true },
  });
  fixtureSourceId = source.id;

  const existingAdministrator = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (existingAdministrator) {
    administratorId = existingAdministrator.id;
  } else {
    const email = testEmail("listing-invariant-admin");
    const administrator = await prisma.user.create({
      data: {
        displayName: "Listing Invariant Administrator",
        email,
        normalizedEmail: email,
        passwordHash: "integration-test-password-hash",
        emailVerifiedAt: new Date(),
        role: "SUPER_ADMIN",
      },
      select: { id: true },
    });
    administratorId = administrator.id;
  }

  const email = testEmail("listing-invariant-organizer");
  const organizerUser = await prisma.user.create({
    data: {
      displayName: "Listing Invariant Organizer",
      email,
      normalizedEmail: email,
      passwordHash: "integration-test-password-hash",
      emailVerifiedAt: new Date(),
    },
  });
  const organizer = await prisma.organizerProfile.create({
    data: { userId: organizerUser.id },
    select: { id: true },
  });
  organizerId = organizer.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("listing import database invariants", () => {
  it("seals exact batch results and rejects late rows or count mismatches", async () => {
    const batchId = randomUUID();
    await prisma.$transaction(async (transaction) => {
      await insertBatch(transaction, batchId, { invalidRows: 1 });
      await insertRow(transaction, { batchId, status: "INVALID" });
      await sealBatch(transaction, batchId);
    });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "listing_import_rows" (
          "batch_id", "row_number", "status", "input_json",
          "validation_failures"
        ) VALUES (
          ${batchId}::UUID, 2, 'INVALID', '{}'::JSONB,
          '["INVALID_FIXTURE"]'::JSONB
        )
      `,
    ).rejects.toThrow(/unsealed batch/iu);

    await expect(
      prisma.$transaction(async (transaction) => {
        const mismatchedBatchId = randomUUID();
        await insertBatch(transaction, mismatchedBatchId, { invalidRows: 1 });
        await sealBatch(transaction, mismatchedBatchId);
      }),
    ).rejects.toThrow(/counts do not match/iu);
  });

  it("enforces source-record presence in both directions", async () => {
    const sourceRecordId = await createSourceRecord();

    for (const status of ["INVALID", "IDENTITY_CONFLICT"] as const) {
      await expect(
        prisma.$transaction(async (transaction) => {
          const batchId = randomUUID();
          await insertBatch(transaction, batchId, {
            ...(status === "INVALID"
              ? { invalidRows: 1 }
              : { identityConflictRows: 1 }),
          });
          await insertRow(transaction, {
            batchId,
            sourceRecordId,
            status,
          });
        }),
      ).rejects.toThrow(/listing_import_rows_source_record/iu);
    }

    await expect(
      prisma.$transaction(async (transaction) => {
        const batchId = randomUUID();
        await insertBatch(transaction, batchId, { candidateRows: 1 });
        await insertRow(transaction, {
          batchId,
          sourceRecordId: null,
          status: "CANDIDATE_CREATED",
        });
      }),
    ).rejects.toThrow(/listing_import_rows_source_record/iu);
  });

  it("rejects a candidate-created result without its immutable candidate", async () => {
    const sourceRecordId = await createSourceRecord();
    await expect(
      prisma.$transaction(async (transaction) => {
        const batchId = randomUUID();
        await insertBatch(transaction, batchId, { candidateRows: 1 });
        await insertRow(transaction, {
          batchId,
          sourceRecordId,
          status: "CANDIDATE_CREATED",
        });
        await sealBatch(transaction, batchId);
      }),
    ).rejects.toThrow(/candidate result does not match/iu);
  });

  it("binds an API idempotency key durably to a manual-origin batch", async () => {
    const batchId = randomUUID();
    await prisma.$transaction(async (transaction) => {
      await insertBatch(transaction, batchId, { invalidRows: 1 });
      await insertRow(transaction, { batchId, status: "INVALID" });
      await sealBatch(transaction, batchId);
    });
    const credential = await prisma.listingIngestionCredential.create({
      data: {
        sourceId: fixtureSourceId,
        name: unique("credential"),
        tokenDigest: randomDigest(),
        displayPrefix: `esb_ing_${publicId()}`,
        createdByUserId: administratorId,
      },
    });
    const keyDigest = randomDigest();
    const requestDigest = randomDigest();

    await prisma.$executeRaw`
      INSERT INTO "listing_import_idempotency_keys" (
        "credential_id", "idempotency_key_digest", "request_digest", "batch_id"
      ) VALUES (
        ${credential.id}::UUID, ${keyDigest}, ${requestDigest}, ${batchId}::UUID
      )
    `;
    const bindings = await prisma.$queryRaw<
      Array<{ batch_id: string; request_digest: string }>
    >`
      SELECT "batch_id", "request_digest"
      FROM "listing_import_idempotency_keys"
      WHERE "credential_id" = ${credential.id}::UUID
        AND "idempotency_key_digest" = ${keyDigest}
    `;
    expect(bindings).toEqual([
      { batch_id: batchId, request_digest: requestDigest },
    ]);

    await expect(
      prisma.$executeRaw`
        UPDATE "listing_import_idempotency_keys"
        SET "request_digest" = ${digest("2")}
        WHERE "credential_id" = ${credential.id}::UUID
          AND "idempotency_key_digest" = ${keyDigest}
      `,
    ).rejects.toThrow(/idempotency bindings are immutable/iu);
  });

  it("rejects public-ID collisions in both insertion orders", async () => {
    const eventFirstPublicId = publicId();
    await createEvent(eventFirstPublicId);
    await expect(
      publishExternalListing(
        await createPublishableCandidate(),
        eventFirstPublicId,
      ),
    ).rejects.toThrow(/public[_ ]id|unique constraint/iu);

    const externalFirstPublicId = publicId();
    await publishExternalListing(
      await createPublishableCandidate(),
      externalFirstPublicId,
    );
    await expect(createEvent(externalFirstPublicId)).rejects.toThrow();
  });

  it("serializes concurrent Event and ExternalListing public-ID claims", async () => {
    const sharedPublicId = publicId();
    const candidate = await createPublishableCandidate();
    const outcomes = await Promise.allSettled([
      createEvent(sharedPublicId),
      publishExternalListing(candidate, sharedPublicId),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
  });

  it("rejects unresolved duplicates on either side of publication", async () => {
    const duplicateTarget = await createEvent(publicId());

    const publishedCandidate = await createPublishableCandidate();
    await publishExternalListing(publishedCandidate, publicId());
    await expect(
      prisma.listingDuplicateMatch.create({
        data: {
          candidateId: publishedCandidate.candidateId,
          eventId: duplicateTarget.id,
          reasons: ["TITLE_SIMILARITY"],
        },
      }),
    ).rejects.toThrow(/cannot gain unresolved duplicates/iu);

    const unresolvedCandidate = await createPublishableCandidate();
    await prisma.listingDuplicateMatch.create({
      data: {
        candidateId: unresolvedCandidate.candidateId,
        eventId: duplicateTarget.id,
        reasons: ["TITLE_SIMILARITY"],
      },
    });
    await expect(
      publishExternalListing(unresolvedCandidate, publicId()),
    ).rejects.toThrow(/unresolved duplicate/iu);
  });
});
