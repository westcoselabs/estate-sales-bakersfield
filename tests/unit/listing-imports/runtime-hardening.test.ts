import { describe, expect, it, vi } from "vitest";

import { handleListingIngestionRequest } from "@/app/api/ingestion/v1/listing-batches/route";
import {
  boundedListingImportInput,
  ListingImportService,
  stableJsonDigest,
  type ListingImportTransactionInput,
} from "@/modules/listing-imports";

import {
  envelope,
  listingItem,
  manualContext,
  repository,
  source,
} from "./fixtures";

function recordingService(
  inspect: (input: ListingImportTransactionInput) => void,
): ListingImportService {
  const fallback = repository();
  return new ListingImportService(
    repository({
      processBatchAtomically: async (input) => {
        inspect(input);
        return fallback.processBatchAtomically(input);
      },
    }),
  );
}

describe("listing import runtime hardening", () => {
  it("digests 20,000 levels without recursive stack exhaustion", () => {
    let value: unknown = null;
    for (let depth = 0; depth < 20_000; depth += 1) {
      value = { nested: value };
    }

    expect(stableJsonDigest(value)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("returns a bounded INVALID row for deeply nested authenticated JSON", async () => {
    const processBatchAtomically = vi.fn();
    const imports = recordingService((input) => {
      processBatchAtomically(input);
      expect(input.rows[0]).toEqual({
        status: "INVALID",
        rowNumber: 1,
        inputJson: {},
        validationCodes: ["ITEM_INVALID"],
      });
      expect(
        Buffer.byteLength(JSON.stringify(input.rows[0]?.inputJson), "utf8"),
      ).toBeLessThanOrEqual(12 * 1_024);
    });
    const nested = `${'{"nested":'.repeat(20_000)}null${"}".repeat(20_000)}`;
    const body = JSON.stringify(envelope([])).replace(
      '"items":[]',
      `"items":[${nested}]`,
    );
    const response = await handleListingIngestionRequest(
      new Request("http://localhost/api/ingestion/v1/listing-batches", {
        method: "POST",
        body,
        headers: {
          authorization: `Bearer esb_ing_${"A".repeat(43)}`,
          "content-type": "application/json",
          "idempotency-key": "deep-structure-fixture",
        },
      }),
      {
        credentials: {
          authenticate: vi.fn(async () => ({
            credentialId: "credential-1",
            source,
          })),
        },
        imports,
        rateLimit: {
          assertNetworkAllowed: vi.fn(async () => undefined),
          assertCredentialAllowed: vi.fn(async () => undefined),
        },
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      status: "REJECTED",
      counts: { total: 1, invalid: 1 },
      rows: [{ status: "INVALID", validationCodes: ["ITEM_INVALID"] }],
    });
    expect(processBatchAtomically).toHaveBeenCalledOnce();
  });

  it("caps retained invalid JSON by serialized UTF-8 bytes and node count", () => {
    const bounded = boundedListingImportInput({
      description: "\u0000\ud83d\ude80".repeat(100_000),
      title: Array.from({ length: 2_000 }, (_, index) => ({ index })),
    });

    expect(
      Buffer.byteLength(JSON.stringify(bounded), "utf8"),
    ).toBeLessThanOrEqual(12 * 1_024);
  });

  it("marks excessively broad schedules invalid before duplicate lookup", async () => {
    const inspect = vi.fn((input: ListingImportTransactionInput) => {
      expect(input.rows[0]).toMatchObject({
        status: "INVALID",
        validationCodes: ["SCHEDULE_INVALID"],
      });
    });
    const imports = recordingService(inspect);

    await expect(
      imports.importBatch(
        envelope([
          listingItem({
            localStartsAt: "2026-08-08T09:00",
            localEndsAt: "2026-09-08T15:00",
          }),
        ]),
        manualContext,
      ),
    ).resolves.toMatchObject({ status: "REJECTED" });
    expect(inspect).toHaveBeenCalledOnce();
  });
});
