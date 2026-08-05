import { describe, expect, it } from "vitest";

import {
  batchAuditMetadata,
  boundedListingImportInput,
  candidateAuditMetadata,
  itemValidationCodes,
  listingImportEnvelopeSchema,
  listingImportItemSchema,
} from "@/modules/listing-imports";

import { envelope, listingItem } from "./fixtures";

describe("listing import schemas and audit boundaries", () => {
  it("accepts only approximate imported locations", () => {
    const result = listingImportItemSchema.safeParse({
      ...listingItem(),
      privacyMode: "EXACT_ADDRESS",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(itemValidationCodes(result.error)).toEqual([
        "PRIVACY_MODE_INVALID",
      ]);
    }
  });

  it("rejects unknown item keys with a bounded safe code", () => {
    const result = listingImportItemSchema.safeParse({
      ...listingItem(),
      unexpectedPayload: "not part of listing-import.v1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(itemValidationCodes(result.error)).toEqual(["ITEM_INVALID"]);
    }
  });

  it("normalizes missing or blank optional address lines to null", () => {
    expect(
      listingImportItemSchema.parse({
        ...listingItem(),
        addressLine1: undefined,
        addressLine2: "   ",
      }),
    ).toMatchObject({ addressLine1: null, addressLine2: null });
  });

  it("enforces bounded envelope and identity fields", () => {
    expect(
      listingImportEnvelopeSchema.safeParse({
        ...envelope([listingItem()]),
        ingestorRunId: "r".repeat(101),
      }).success,
    ).toBe(false);
    expect(
      listingImportItemSchema.safeParse({
        ...listingItem(),
        sourceListingId: "s".repeat(255),
      }).success,
    ).toBe(true);
    expect(
      listingImportItemSchema.safeParse({
        ...listingItem(),
        sourceListingId: "s".repeat(256),
      }).success,
    ).toBe(false);
    expect(
      listingImportEnvelopeSchema.safeParse({
        ...envelope(Array.from({ length: 201 }, () => null)),
      }).success,
    ).toBe(false);
  });

  it("builds audit metadata from IDs, counts, digests, and safe codes only", () => {
    const batch = batchAuditMetadata({
      batchId: "batch-1",
      sourceId: "source-1",
      requestDigest: "a".repeat(64),
      payloadDigest: "b".repeat(64),
      counts: {
        total: 2,
        candidateCreated: 1,
        invalid: 1,
        exactDuplicate: 0,
        sourceChanged: 0,
        identityConflict: 0,
      },
      validationCodes: ["TITLE_INVALID", "TITLE_INVALID"],
    });
    expect(batch).toEqual({
      batchId: "batch-1",
      sourceId: "source-1",
      requestDigest: "a".repeat(64),
      payloadDigest: "b".repeat(64),
      total: 2,
      candidateCreated: 1,
      invalid: 1,
      exactDuplicate: 0,
      sourceChanged: 0,
      identityConflict: 0,
      validationCodes: ["TITLE_INVALID"],
    });
    expect(JSON.stringify(batch)).not.toMatch(/address|sourceUrl|token/u);

    expect(
      candidateAuditMetadata({
        batchId: "batch-1",
        candidateId: "candidate-1",
        sourceRecordId: "source-record-1",
        contentHash: "c".repeat(64),
      }),
    ).toEqual({
      batchId: "batch-1",
      candidateId: "candidate-1",
      sourceRecordId: "source-record-1",
      contentHash: "c".repeat(64),
    });
  });

  it("bounds retained invalid observations below the database JSON limit", () => {
    const oversized = Object.fromEntries(
      [
        "sourceListingId",
        "sourceUrl",
        "retrievedAt",
        "contentHash",
        "eventType",
        "title",
        "description",
        "localStartsAt",
        "localEndsAt",
        "timezone",
        "addressLine1",
        "addressLine2",
        "city",
        "region",
        "postalCode",
        "countryCode",
        "privacyMode",
      ].map((field) => [field, "\u0000".repeat(6_000)]),
    );
    const bounded = boundedListingImportInput(oversized);
    expect(Buffer.byteLength(JSON.stringify(bounded), "utf8")).toBeLessThan(
      65_536,
    );
  });
});
