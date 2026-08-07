import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(
    "prisma/migrations/20260804120000_listing_imports_core/migration.sql",
  ),
  "utf8",
);

const EXPECTED_MODELS = [
  "ExternalListing",
  "ExternalListingLocation",
  "ListingDuplicateMatch",
  "ListingImportBatch",
  "ListingImportCandidate",
  "ListingImportIdempotencyKey",
  "ListingImportRow",
  "ListingImportSource",
  "ListingIngestionCredential",
  "ListingPublicIdReservation",
  "ListingSourceRecord",
];

const EXPECTED_TABLES = [
  "external_listing_locations",
  "external_listings",
  "listing_duplicate_matches",
  "listing_import_batches",
  "listing_import_candidates",
  "listing_import_idempotency_keys",
  "listing_import_rows",
  "listing_import_sources",
  "listing_ingestion_credentials",
  "listing_public_id_reservations",
  "listing_source_records",
];

describe("listing imports migration boundary", () => {
  it("adds exactly the approved models and no cover persistence", () => {
    const models = [...schema.matchAll(/^model (Listing\w+|External\w+) \{/gmu)]
      .map((match) => match[1] ?? "")
      .sort();
    expect(models).toEqual(EXPECTED_MODELS);
    expect(schema).not.toMatch(/ExternalListingCover|ListingImportCover/u);
    expect(migration).not.toMatch(
      /external_listing_covers|cover_reservation/iu,
    );
  });

  it("creates only the eleven bounded tables and leaves organizer data untouched", () => {
    const tables = [...migration.matchAll(/^CREATE TABLE "([^"]+)"/gmu)]
      .map((match) => match[1] ?? "")
      .sort();
    expect(tables).toEqual(EXPECTED_TABLES);
    expect(migration).not.toMatch(
      /ALTER TABLE "(?:events|payment_attempts|event_publications)"/u,
    );
    expect(migration).not.toMatch(
      /(?:DROP|TRUNCATE) TABLE "(?:events|payment_attempts|event_publications)"/u,
    );
  });

  it("seeds the fixed sources and protects provenance correlations", () => {
    expect(migration).toContain("'fixture'");
    expect(migration).toContain("'fixture.invalid'");
    expect(migration).toContain("'estatesales-org'");
    expect(migration).toContain("'www.estatesales.org'");
    expect(migration).toContain(
      "listing import row source does not match its batch",
    );
    expect(migration).toContain(
      "listing source record last-seen time cannot move backwards",
    );
    expect(migration).toContain(
      "organizer event duplicate links require a publication",
    );
  });
});
