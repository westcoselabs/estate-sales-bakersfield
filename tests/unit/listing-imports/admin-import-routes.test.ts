import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as AdminModule from "@/modules/admin";
import type { CurrentSession } from "@/modules/auth";
import type * as AuthModule from "@/modules/auth";
import type * as ListingImportsModule from "@/modules/listing-imports";
import type * as ApplicationUrlModule from "@/platform/config/application-url";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  enforceAdminRateLimit: vi.fn(),
  importBatch: vi.fn(),
  createCredential: vi.fn(),
  revokeCredential: vi.fn(),
}));

vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock("@/modules/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof AdminModule>()),
  createConfiguredAdminRateLimiter: vi.fn(() => ({})),
  enforceAdminRateLimit: mocks.enforceAdminRateLimit,
}));

vi.mock("@/modules/listing-imports", async (importOriginal) => ({
  ...(await importOriginal<typeof ListingImportsModule>()),
  createConfiguredListingImportService: vi.fn(() => ({
    importBatch: mocks.importBatch,
  })),
  createConfiguredListingIngestionCredentialService: vi.fn(() => ({
    create: mocks.createCredential,
    revoke: mocks.revokeCredential,
  })),
}));

vi.mock("@/platform/config/application-url", async (importOriginal) => ({
  ...(await importOriginal<typeof ApplicationUrlModule>()),
  getTrustedApplicationUrls: vi.fn(() => [new URL("http://localhost:3000")]),
}));

import { POST as importBatch } from "@/app/api/admin/imports/batches/route";
import { POST as createCredential } from "@/app/api/admin/imports/credentials/route";
import { POST as revokeCredential } from "@/app/api/admin/imports/credentials/[credentialId]/revoke/route";

import { envelope, listingItem } from "./fixtures";

const administratorId = "20000000-0000-4000-8000-000000000001";
const credentialId = "40000000-0000-4000-8000-000000000001";

function session(passwordAuthenticatedAt = new Date()): CurrentSession {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    userId: administratorId,
    createdAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
    passwordAuthenticatedAt,
    metadata: {},
    principal: {
      id: administratorId,
      displayName: "Import Administrator",
      email: "admin@example.test",
      emailVerifiedAt: new Date(),
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  };
}

function adminRequest(
  path: string,
  body: string,
  input: { readonly contentType?: string; readonly origin?: string } = {},
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    body,
    headers: {
      "content-type": input.contentType ?? "application/json",
      origin: input.origin ?? "http://localhost:3000",
      "x-request-id": "admin-import-route-unit",
    },
  });
}

const importResult = {
  contractVersion: "listing-import-result.v1",
  batchId: "30000000-0000-4000-8000-000000000001",
  replayed: false,
  status: "COMPLETED",
  counts: {
    total: 1,
    candidateCreated: 1,
    invalid: 0,
    exactDuplicate: 0,
    sourceChanged: 0,
    identityConflict: 0,
  },
  rows: [],
} as const;

beforeEach(() => {
  mocks.getCurrentSession.mockReset();
  mocks.getCurrentSession.mockResolvedValue(session());
  mocks.enforceAdminRateLimit.mockReset();
  mocks.enforceAdminRateLimit.mockResolvedValue(undefined);
  mocks.importBatch.mockReset();
  mocks.importBatch.mockResolvedValue(importResult);
  mocks.createCredential.mockReset();
  mocks.createCredential.mockResolvedValue({
    credentialId,
    sourceId: "50000000-0000-4000-8000-000000000001",
    sourceKey: "fixture",
    name: "Local crawler",
    displayPrefix: "esb_ing_AAAAAAAAAAAAAAAA",
    rawToken: `esb_ing_${"A".repeat(43)}`,
    createdAt: new Date("2026-08-04T20:00:00.000Z"),
  });
  mocks.revokeCredential.mockReset();
  mocks.revokeCredential.mockResolvedValue({
    credentialId,
    sourceId: "50000000-0000-4000-8000-000000000001",
    revokedAt: new Date("2026-08-04T20:01:00.000Z"),
    alreadyRevoked: false,
  });
});

describe("super-admin listing import routes", () => {
  it("uses trusted-origin, recent-session, rate-limit, and private-response protections for manual JSON", async () => {
    const input = envelope([listingItem()]);
    const response = await importBatch(
      adminRequest("/api/admin/imports/batches", JSON.stringify(input)),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(mocks.enforceAdminRateLimit).toHaveBeenCalledWith(
      {},
      "LISTING_IMPORT",
      administratorId,
    );
    expect(mocks.importBatch).toHaveBeenCalledWith(input, {
      transport: "MANUAL_JSON",
      actor: { kind: "ADMIN_USER", adminUserId: administratorId },
      audit: { requestId: "admin-import-route-unit" },
    });
  });

  it("rejects missing authentication, stale password verification, and an untrusted Origin before mutation", async () => {
    const input = JSON.stringify(envelope([listingItem()]));

    mocks.getCurrentSession.mockResolvedValueOnce(null);
    const unauthenticated = await importBatch(
      adminRequest("/api/admin/imports/batches", input),
    );
    expect(unauthenticated.status).toBe(401);

    mocks.getCurrentSession.mockResolvedValueOnce(
      session(new Date(Date.now() - 16 * 60 * 1_000)),
    );
    const stale = await importBatch(
      adminRequest("/api/admin/imports/batches", input),
    );
    expect(stale.status).toBe(403);

    const untrusted = await importBatch(
      adminRequest("/api/admin/imports/batches", input, {
        origin: "https://untrusted.invalid",
      }),
    );
    expect(untrusted.status).toBe(403);
    expect(mocks.importBatch).not.toHaveBeenCalled();
  });

  it("parses fixed CSV through the transport adapter and rejects unsupported media", async () => {
    const csv = [
      "contract_version,source_key,source_listing_id,source_url,retrieved_at,ingestor_run_id,ingestor_instance_id,parser_version,content_hash,event_type,title,description,local_starts_at,local_ends_at,timezone,address_line_1,address_line_2,city,region,postal_code,country_code,privacy_mode",
      "listing-import.v1,fixture,id,https://fixture.invalid/id,2026-08-04T12:00:00.000Z,run,instance,parser,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,ESTATE_SALE,Fixture title,A sufficiently long fixture description,2026-08-08T09:00,2026-08-08T15:00,America/Los_Angeles,123 Main St,,Bakersfield,CA,93301,US,APPROXIMATE_LOCATION",
    ].join("\n");
    const accepted = await importBatch(
      adminRequest("/api/admin/imports/batches", csv, {
        contentType: "text/csv; charset=utf-8",
      }),
    );
    expect(accepted.status).toBe(201);
    expect(mocks.importBatch).toHaveBeenCalledWith(
      expect.objectContaining({ contractVersion: "listing-import.v1" }),
      expect.objectContaining({ transport: "MANUAL_CSV" }),
    );

    const unsupported = await importBatch(
      adminRequest("/api/admin/imports/batches", "x", {
        contentType: "text/plain",
      }),
    );
    expect(unsupported.status).toBe(415);
  });

  it("enforces the actual one-mebibyte body limit before invoking the service", async () => {
    const response = await importBatch(
      adminRequest("/api/admin/imports/batches", "a".repeat(1_048_577)),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(mocks.importBatch).not.toHaveBeenCalled();
  });

  it("creates a credential with the raw token in the one-time response", async () => {
    const response = await createCredential(
      adminRequest(
        "/api/admin/imports/credentials",
        JSON.stringify({ sourceKey: "fixture", name: "Local crawler" }),
      ),
    );
    const body = (await response.json()) as {
      credential: { token: string };
      warning: string;
    };

    expect(response.status).toBe(201);
    expect(body.credential.token).toMatch(/^esb_ing_[A-Za-z0-9_-]{43}$/u);
    expect(body.warning).toContain("not be shown again");
    expect(mocks.createCredential).toHaveBeenCalledWith({
      sourceKey: "fixture",
      name: "Local crawler",
      actorUserId: administratorId,
      requestId: "admin-import-route-unit",
    });
  });

  it("requires recent password verification for credential creation and revocation", async () => {
    const stale = session(new Date(Date.now() - 16 * 60 * 1_000));
    mocks.getCurrentSession.mockResolvedValue(stale);

    const createResponse = await createCredential(
      adminRequest(
        "/api/admin/imports/credentials",
        JSON.stringify({ sourceKey: "fixture", name: "Local crawler" }),
      ),
    );
    const revokeResponse = await revokeCredential(
      adminRequest(
        `/api/admin/imports/credentials/${credentialId}/revoke`,
        "{}",
      ),
      { params: Promise.resolve({ credentialId }) },
    );

    expect(createResponse.status).toBe(403);
    expect(revokeResponse.status).toBe(403);
    expect(mocks.createCredential).not.toHaveBeenCalled();
    expect(mocks.revokeCredential).not.toHaveBeenCalled();
  });

  it("revokes idempotently and returns a safe 404 for an unknown credential", async () => {
    const requestContext = {
      params: Promise.resolve({ credentialId }),
    };
    const response = await revokeCredential(
      adminRequest(
        `/api/admin/imports/credentials/${credentialId}/revoke`,
        "{}",
      ),
      requestContext,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      credentialId,
      alreadyRevoked: false,
    });

    mocks.revokeCredential.mockResolvedValueOnce(null);
    const missing = await revokeCredential(
      adminRequest(
        `/api/admin/imports/credentials/${credentialId}/revoke`,
        "{}",
      ),
      requestContext,
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      code: "CREDENTIAL_NOT_FOUND",
    });
  });
});
