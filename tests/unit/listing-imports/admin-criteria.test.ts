import { describe, expect, it } from "vitest";

import {
  decodeListingImportAdminCursor,
  encodeListingImportAdminCursor,
  listingImportAdminLandingCriteria,
} from "@/modules/listing-imports/application/admin-criteria";

const cursor = {
  at: new Date("2026-08-07T18:00:00.000Z"),
  id: "10000000-0000-4000-8000-000000000001",
} as const;

describe("listing import admin criteria", () => {
  it("defaults to the bounded candidate view", () => {
    expect(listingImportAdminLandingCriteria({})).toEqual({
      view: "candidates",
      cursor: null,
      limit: 20,
    });
    expect(
      listingImportAdminLandingCriteria({
        view: "not-a-view",
        limit: "not-a-limit",
      }),
    ).toEqual({ view: "candidates", cursor: null, limit: 20 });
  });

  it("bounds page sizes without accepting fractional limits", () => {
    expect(listingImportAdminLandingCriteria({ limit: "0" }).limit).toBe(1);
    expect(listingImportAdminLandingCriteria({ limit: "500" }).limit).toBe(50);
    expect(listingImportAdminLandingCriteria({ limit: "4.5" }).limit).toBe(20);
  });

  it("round-trips a versioned view-bound cursor", () => {
    const encoded = encodeListingImportAdminCursor("batches", cursor);
    expect(decodeListingImportAdminCursor(encoded, "batches")).toEqual(cursor);
    expect(decodeListingImportAdminCursor(encoded, "credentials")).toBeNull();
    expect(
      listingImportAdminLandingCriteria({
        view: "batches",
        cursor: encoded,
        limit: "25",
      }),
    ).toEqual({ view: "batches", cursor, limit: 25 });
  });

  it("fails closed for malformed, oversized, or unsupported cursors", () => {
    const unsupported = Buffer.from(
      JSON.stringify({
        version: 2,
        view: "candidates",
        at: cursor.at.toISOString(),
        id: cursor.id,
      }),
      "utf8",
    ).toString("base64url");
    expect(
      decodeListingImportAdminCursor("not-base64", "candidates"),
    ).toBeNull();
    expect(
      decodeListingImportAdminCursor("a".repeat(513), "candidates"),
    ).toBeNull();
    expect(
      decodeListingImportAdminCursor(unsupported, "candidates"),
    ).toBeNull();
  });
});
