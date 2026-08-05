import { describe, expect, it, vi } from "vitest";

import {
  ListingImportService,
  ListingImportValidationError,
  type ListingImportRepository,
  type ListingImportTransactionInput,
} from "@/modules/listing-imports";

import {
  envelope,
  listingItem,
  manualContext,
  repository,
  source,
  validDigest,
} from "./fixtures";

describe("ListingImportService", () => {
  it("retains invalid observations while preparing valid candidates atomically", async () => {
    const processBatchAtomically = vi.fn(
      async (input: ListingImportTransactionInput) => {
        const valid = input.rows[0];
        const invalid = input.rows[1];
        expect(valid).toMatchObject({
          status: "VALID",
          rowNumber: 1,
          item: {
            canonicalSourceUrl:
              "https://fixture.invalid/listings/fixture-100?page=2&ref=a&ref=z",
            normalizedTitle: "bakersfield estate sale",
            normalizedAddress: "123 main street bakersfield ca 93301 us",
          },
        });
        expect(invalid).toEqual({
          status: "INVALID",
          rowNumber: 2,
          inputJson: expect.objectContaining({ title: "No" }),
          validationCodes: ["TITLE_INVALID"],
        });
        expect(input.requestDigest).toBe(input.payloadDigest);
        expect(input.audit).toEqual({ requestId: "listing-import-unit" });
        return {
          batchId: "batch-partial",
          replayed: false,
          status: "PARTIAL" as const,
          counts: {
            total: 2,
            candidateCreated: 1,
            invalid: 1,
            exactDuplicate: 0,
            sourceChanged: 0,
            identityConflict: 0,
          },
          rows: [
            {
              rowNumber: 1,
              status: "CANDIDATE_CREATED" as const,
              candidateId: "candidate-1",
              validationCodes: [],
            },
            {
              rowNumber: 2,
              status: "INVALID" as const,
              candidateId: null,
              validationCodes: ["TITLE_INVALID" as const],
            },
          ],
        };
      },
    );
    const service = new ListingImportService(
      repository({ processBatchAtomically }),
    );

    const result = await service.importBatch(
      envelope([
        listingItem({
          sourceUrl:
            "https://fixture.invalid/listings/fixture-100/?ref=z&page=2&ref=a",
        }),
        listingItem({ sourceListingId: "fixture-101", title: "No" }),
      ]),
      manualContext,
    );

    expect(processBatchAtomically).toHaveBeenCalledOnce();
    expect(result).toEqual(
      expect.objectContaining({
        contractVersion: "listing-import-result.v1",
        batchId: "batch-partial",
        status: "PARTIAL",
        replayed: false,
      }),
    );
  });

  it("preserves primitive invalid rows instead of coercing them to objects", async () => {
    const processBatchAtomically = vi.fn(
      async (input: ListingImportTransactionInput) => {
        expect(input.rows[0]).toEqual({
          status: "INVALID",
          rowNumber: 1,
          inputJson: null,
          validationCodes: ["ITEM_INVALID"],
        });
        return {
          batchId: "batch-rejected",
          replayed: false,
          status: "REJECTED" as const,
          counts: {
            total: 1,
            candidateCreated: 0,
            invalid: 1,
            exactDuplicate: 0,
            sourceChanged: 0,
            identityConflict: 0,
          },
          rows: [
            {
              rowNumber: 1,
              status: "INVALID" as const,
              candidateId: null,
              validationCodes: ["ITEM_INVALID" as const],
            },
          ],
        };
      },
    );

    await new ListingImportService(
      repository({ processBatchAtomically }),
    ).importBatch(envelope([null]), manualContext);
    expect(processBatchAtomically).toHaveBeenCalledOnce();
  });

  it("reports URL and schedule safe codes without exposing validation messages", async () => {
    const processBatchAtomically = vi.fn(
      async (input: ListingImportTransactionInput) => {
        expect(input.rows[0]).toMatchObject({
          status: "INVALID",
          validationCodes: ["SOURCE_HOST_NOT_ALLOWED", "SCHEDULE_INVALID"],
        });
        return {
          batchId: "batch-invalid",
          replayed: false,
          status: "REJECTED" as const,
          counts: {
            total: 1,
            candidateCreated: 0,
            invalid: 1,
            exactDuplicate: 0,
            sourceChanged: 0,
            identityConflict: 0,
          },
          rows: [
            {
              rowNumber: 1,
              status: "INVALID" as const,
              candidateId: null,
              validationCodes: [
                "SOURCE_HOST_NOT_ALLOWED" as const,
                "SCHEDULE_INVALID" as const,
              ],
            },
          ],
        };
      },
    );

    await new ListingImportService(
      repository({ processBatchAtomically }),
    ).importBatch(
      envelope([
        {
          ...listingItem(),
          sourceUrl: "https://other.invalid/listing",
          localStartsAt: "2026-08-08T15:00",
          localEndsAt: "2026-08-08T09:00",
        },
      ]),
      manualContext,
    );
  });

  it("distinguishes invalid timezone from a valid-timezone schedule failure", async () => {
    const processBatchAtomically = vi.fn(
      async (input: ListingImportTransactionInput) => {
        expect(input.rows[0]).toMatchObject({
          status: "INVALID",
          validationCodes: ["TIMEZONE_INVALID"],
        });
        return {
          batchId: "batch-timezone",
          replayed: false,
          status: "REJECTED" as const,
          counts: {
            total: 1,
            candidateCreated: 0,
            invalid: 1,
            exactDuplicate: 0,
            sourceChanged: 0,
            identityConflict: 0,
          },
          rows: [
            {
              rowNumber: 1,
              status: "INVALID" as const,
              candidateId: null,
              validationCodes: ["TIMEZONE_INVALID" as const],
            },
          ],
        };
      },
    );

    await new ListingImportService(
      repository({ processBatchAtomically }),
    ).importBatch(
      envelope([{ ...listingItem(), timezone: "Not/A_Timezone" }]),
      manualContext,
    );
  });

  it("rejects a syntactically valid but incorrect content hash per row", async () => {
    const processBatchAtomically = vi.fn(
      async (input: ListingImportTransactionInput) => {
        expect(input.rows[0]).toMatchObject({
          status: "INVALID",
          validationCodes: ["CONTENT_HASH_MISMATCH"],
        });
        return {
          batchId: "batch-hash",
          replayed: false,
          status: "REJECTED" as const,
          counts: {
            total: 1,
            candidateCreated: 0,
            invalid: 1,
            exactDuplicate: 0,
            sourceChanged: 0,
            identityConflict: 0,
          },
          rows: [
            {
              rowNumber: 1,
              status: "INVALID" as const,
              candidateId: null,
              validationCodes: ["CONTENT_HASH_MISMATCH" as const],
            },
          ],
        };
      },
    );

    await new ListingImportService(
      repository({ processBatchAtomically }),
    ).importBatch(
      envelope([listingItem({ contentHash: "0".repeat(64) })]),
      manualContext,
    );
  });

  it("returns an idempotent repository replay unchanged", async () => {
    const imports = repository({
      processBatchAtomically: async () => ({
        batchId: "batch-original",
        replayed: true,
        status: "COMPLETED",
        counts: {
          total: 1,
          candidateCreated: 1,
          invalid: 0,
          exactDuplicate: 0,
          sourceChanged: 0,
          identityConflict: 0,
        },
        rows: [
          {
            rowNumber: 1,
            status: "CANDIDATE_CREATED",
            candidateId: "candidate-original",
            validationCodes: [],
          },
        ],
      }),
    });

    await expect(
      new ListingImportService(imports).importBatch(envelope([listingItem()]), {
        transport: "API",
        actor: {
          kind: "API_CREDENTIAL",
          credentialId: "credential-1",
          idempotencyKeyDigest: validDigest,
        },
        requestDigest: validDigest,
      }),
    ).resolves.toMatchObject({
      contractVersion: "listing-import-result.v1",
      batchId: "batch-original",
      replayed: true,
    });
  });

  it("rejects unsupported envelopes before repository access", async () => {
    const imports = repository({
      findSourceByKey: vi.fn(async () => source),
      processBatchAtomically: vi.fn(),
    });
    await expect(
      new ListingImportService(imports).importBatch(
        { ...envelope([listingItem()]), contractVersion: "listing-import.v2" },
        manualContext,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONTRACT_VERSION" });
    expect(imports.findSourceByKey).not.toHaveBeenCalled();
    expect(imports.processBatchAtomically).not.toHaveBeenCalled();
  });

  it("does not begin an atomic write for a disabled source", async () => {
    const imports: ListingImportRepository = repository({
      findSourceByKey: vi.fn(async () => ({ ...source, enabled: false })),
      processBatchAtomically: vi.fn(),
    });
    await expect(
      new ListingImportService(imports).importBatch(
        envelope([listingItem()]),
        manualContext,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_DISABLED" });
    expect(imports.processBatchAtomically).not.toHaveBeenCalled();
  });

  it("rejects a production-disabled source before any write in production", async () => {
    const imports: ListingImportRepository = repository({
      findSourceByKey: vi.fn(async () => ({
        ...source,
        enabled: true,
        productionAllowed: false,
      })),
      processBatchAtomically: vi.fn(),
    });

    await expect(
      new ListingImportService(imports, "production").importBatch(
        envelope([listingItem()]),
        manualContext,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_PRODUCTION_ALLOWED" });
    expect(imports.processBatchAtomically).not.toHaveBeenCalled();
  });

  it("requires transport and actor types to agree", async () => {
    await expect(
      new ListingImportService(repository()).importBatch(
        envelope([listingItem()]),
        {
          transport: "API",
          actor: {
            kind: "ADMIN_USER",
            adminUserId: "admin-1",
          },
        },
      ),
    ).rejects.toBeInstanceOf(ListingImportValidationError);
  });
});
