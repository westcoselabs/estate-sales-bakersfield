import { describe, expect, it, vi } from "vitest";

import {
  handleListingIngestionRequest,
  type ListingIngestionRouteDependencies,
} from "@/app/api/ingestion/v1/listing-batches/route";
import {
  ListingImportConflictError,
  ListingImportError,
  sha256Digest,
} from "@/modules/listing-imports";
import { RateLimitExceededError } from "@/modules/auth";

import { envelope, listingItem, source } from "./fixtures";

const token = `esb_ing_${"A".repeat(43)}`;
const idempotencyKey = "fixture-run-2026-08-04";
const successfulResult = {
  contractVersion: "listing-import-result.v1" as const,
  batchId: "30000000-0000-4000-8000-000000000001",
  replayed: false,
  status: "COMPLETED" as const,
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
      status: "CANDIDATE_CREATED" as const,
      candidateId: "candidate-1",
      validationCodes: [],
    },
  ],
};

function dependencies(
  overrides: Partial<ListingIngestionRouteDependencies> = {},
): ListingIngestionRouteDependencies {
  return {
    credentials: {
      authenticate: vi.fn(async () => ({
        credentialId: "credential-1",
        source,
      })),
    },
    imports: { importBatch: vi.fn(async () => successfulResult) },
    rateLimit: {
      assertNetworkAllowed: vi.fn(async () => undefined),
      assertCredentialAllowed: vi.fn(async () => undefined),
    },
    ...overrides,
  };
}

function request(
  body: string,
  headers: Readonly<Record<string, string>> = {},
): Request {
  return new Request("http://localhost:3000/api/ingestion/v1/listing-batches", {
    method: "POST",
    body,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
      "idempotency-key": idempotencyKey,
      "x-request-id": "ingestion-route-unit",
      origin: "https://untrusted-browser-origin.invalid",
      ...headers,
    },
  });
}

describe("listing ingestion route", () => {
  it("accepts authenticated JSON without browser Origin validation and returns 201", async () => {
    const input = envelope([listingItem()]);
    const body = JSON.stringify(input);
    const configured = dependencies();
    const response = await handleListingIngestionRequest(
      request(body),
      configured,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe("ingestion-route-unit");
    await expect(response.json()).resolves.toEqual(successfulResult);
    expect(configured.rateLimit.assertNetworkAllowed).toHaveBeenCalledOnce();
    expect(configured.rateLimit.assertCredentialAllowed).toHaveBeenCalledWith(
      "credential-1",
    );
    expect(configured.imports.importBatch).toHaveBeenCalledWith(input, {
      transport: "API",
      actor: {
        kind: "API_CREDENTIAL",
        credentialId: "credential-1",
        idempotencyKeyDigest: sha256Digest(idempotencyKey),
      },
      requestDigest: sha256Digest(body),
      audit: { requestId: "ingestion-route-unit" },
    });
  });

  it("returns 200 for an idempotent replay", async () => {
    const configured = dependencies({
      imports: {
        importBatch: vi.fn(async () => ({
          ...successfulResult,
          replayed: true,
        })),
      },
    });
    const response = await handleListingIngestionRequest(
      request(JSON.stringify(envelope([listingItem()]))),
      configured,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ replayed: true });
  });

  it("returns bounded row results for a partially accepted batch", async () => {
    const partialResult = {
      ...successfulResult,
      status: "PARTIAL" as const,
      counts: {
        ...successfulResult.counts,
        total: 2,
        invalid: 1,
      },
      rows: [
        successfulResult.rows[0]!,
        {
          rowNumber: 2,
          status: "INVALID" as const,
          candidateId: null,
          validationCodes: ["TITLE_INVALID" as const],
        },
      ],
    };
    const response = await handleListingIngestionRequest(
      request(JSON.stringify(envelope([listingItem(), { title: "No" }]))),
      dependencies({
        imports: { importBatch: vi.fn(async () => partialResult) },
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(partialResult);
  });

  it.each([
    [undefined, "missing"],
    ["Bearer wrong", "wrong"],
    [`Bearer ${token}`, "revoked"],
  ] as const)(
    "returns the same safe 401 for a %s credential",
    async (authorization, label) => {
      void label;
      const configured = dependencies({
        credentials: { authenticate: vi.fn(async () => null) },
      });
      const headers: Record<string, string> = {};
      if (authorization === undefined) headers.authorization = "";
      else headers.authorization = authorization;
      const response = await handleListingIngestionRequest(
        request(JSON.stringify(envelope([listingItem()])), headers),
        configured,
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        schema: "listing-import-error.v1",
        error: { code: "INVALID_CREDENTIAL" },
      });
      expect(configured.imports.importBatch).not.toHaveBeenCalled();
    },
  );

  it("rejects a source outside the authenticated credential scope", async () => {
    const configured = dependencies();
    const response = await handleListingIngestionRequest(
      request(
        JSON.stringify({
          ...envelope([listingItem()]),
          sourceKey: "estatesales-org",
        }),
      ),
      configured,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SOURCE_MISMATCH" },
    });
    expect(configured.imports.importBatch).not.toHaveBeenCalled();
  });

  it("validates the media type, idempotency key, JSON, and actual byte cap", async () => {
    const base = JSON.stringify(envelope([listingItem()]));
    const cases = [
      {
        request: request(base, { "content-type": "text/plain" }),
        status: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
      },
      {
        request: request(base, { "idempotency-key": "bad key" }),
        status: 400,
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      {
        request: request("{"),
        status: 400,
        code: "INVALID_JSON",
      },
      {
        request: request("a".repeat(1_048_577)),
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
      },
    ];

    for (const testCase of cases) {
      const response = await handleListingIngestionRequest(
        testCase.request,
        dependencies(),
      );
      expect(response.status).toBe(testCase.status);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: testCase.code },
      });
    }
  });

  it("maps conflict and rate-limit failures without exposing internals", async () => {
    const conflictResponse = await handleListingIngestionRequest(
      request(JSON.stringify(envelope([listingItem()]))),
      dependencies({
        imports: {
          importBatch: vi.fn(async () => {
            throw new ListingImportConflictError("IDEMPOTENCY_CONFLICT");
          }),
        },
      }),
    );
    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });

    const limitedResponse = await handleListingIngestionRequest(
      request(JSON.stringify(envelope([listingItem()]))),
      dependencies({
        rateLimit: {
          assertNetworkAllowed: vi.fn(async () => {
            throw new RateLimitExceededError(17);
          }),
          assertCredentialAllowed: vi.fn(async () => undefined),
        },
      }),
    );
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("retry-after")).toBe("17");
    await expect(limitedResponse.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
  });

  it("maps a credential revoked during the transaction to the same safe 401", async () => {
    const response = await handleListingIngestionRequest(
      request(JSON.stringify(envelope([listingItem()]))),
      dependencies({
        imports: {
          importBatch: vi.fn(async () => {
            throw new ListingImportError(
              "ACTOR_TRANSPORT_MISMATCH",
              "credential revoked",
            );
          }),
        },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_CREDENTIAL" },
    });
  });
});
