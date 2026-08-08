import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleListingIngestionRequest } from "@/app/api/ingestion/v1/listing-batches/route";
import { ListingIngestionCredentialService } from "@/modules/listing-imports/application/credential-service";
import { listingContentHash } from "@/modules/listing-imports/application/content-hash";
import { ListingImportService } from "@/modules/listing-imports/application/listing-import-service";
import type { ListingImportCommandContext } from "@/modules/listing-imports/application/ports";
import { normalizeListingContent } from "@/modules/listing-imports/domain/normalization";
import { CryptoListingIngestionCredentialProvider } from "@/modules/listing-imports/infrastructure/crypto-listing-ingestion-credential-provider";
import { parseListingImportCsv } from "@/modules/listing-imports/infrastructure/csv-listing-import-adapter";
import { PrismaListingImportRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-import-repository";
import { PrismaListingIngestionCredentialRepository } from "@/modules/listing-imports/infrastructure/prisma-listing-ingestion-credential-repository";

import { createIntegrationClient } from "./support/database";
import { testEmail, testRunId } from "./support/test-run";

const prisma = createIntegrationClient();
const repository = new PrismaListingImportRepository(prisma);
const service = new ListingImportService(repository);
const credentialRepository = new PrismaListingIngestionCredentialRepository(
  prisma,
);
const credentialService = new ListingIngestionCredentialService(
  credentialRepository,
  new CryptoListingIngestionCredentialProvider(),
  { production: false },
);

let administratorId: string;
let administratorSessionId: string;

const contractFixtureRoot = resolve("tests/fixtures/listing-import/v1");

function identifier(label: string): string {
  return `${testRunId()}-${label}-${crypto.randomUUID().slice(0, 8)}`;
}

function manualContext(
  transport: "MANUAL_JSON" | "MANUAL_CSV" = "MANUAL_JSON",
): ListingImportCommandContext {
  return {
    transport,
    actor: { kind: "ADMIN_USER", adminUserId: administratorId },
    audit: { requestId: crypto.randomUUID() },
  };
}

function validItem(
  label: string,
  overrides: Partial<{
    sourceListingId: string;
    sourceUrl: string;
    retrievedAt: string;
    title: string;
    description: string;
    localStartsAt: string;
    localEndsAt: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string;
    region: string;
    postalCode: string;
  }> = {},
) {
  const content = {
    eventType: "ESTATE_SALE" as const,
    title: "Fixture Estate Sale",
    description:
      "A deterministic fixture listing with furniture, books, and household goods.",
    localStartsAt: "2026-09-12T09:00",
    localEndsAt: "2026-09-13T15:00",
    timezone: "America/Los_Angeles",
    addressLine1: "101 Example Avenue" as string | null,
    addressLine2: null as string | null,
    city: "Bakersfield",
    region: "CA",
    postalCode: "93301",
    countryCode: "US",
    privacyMode: "APPROXIMATE_LOCATION" as const,
    ...overrides,
  };
  const normalized = normalizeListingContent(content);
  return {
    sourceListingId: overrides.sourceListingId ?? label,
    sourceUrl:
      overrides.sourceUrl ?? `https://fixture.invalid/listings/${label}`,
    retrievedAt: overrides.retrievedAt ?? "2026-08-04T16:00:00.000Z",
    contentHash: listingContentHash(normalized),
    eventType: content.eventType,
    title: content.title,
    description: content.description,
    localStartsAt: content.localStartsAt,
    localEndsAt: content.localEndsAt,
    timezone: content.timezone,
    addressLine1: content.addressLine1,
    addressLine2: content.addressLine2,
    city: content.city,
    region: content.region,
    postalCode: content.postalCode,
    countryCode: content.countryCode,
    privacyMode: content.privacyMode,
  };
}

function envelope(label: string, items: readonly unknown[]) {
  return {
    contractVersion: "listing-import.v1",
    sourceKey: "fixture",
    ingestorRunId: identifier(`run-${label}`),
    ingestorInstanceId: `${testRunId()}-listing-imports`,
    parserVersion: "integration-fixture@1.0.0",
    items,
  };
}

beforeAll(async () => {
  const existing = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (existing) {
    administratorId = existing.id;
  } else {
    const email = testEmail("listing-import-admin");
    const administrator = await prisma.user.create({
      data: {
        displayName: "Listing Import Administrator",
        email,
        normalizedEmail: email,
        passwordHash: "integration-test-password-hash",
        emailVerifiedAt: new Date(),
        role: "SUPER_ADMIN",
      },
    });
    administratorId = administrator.id;
  }
  const authenticatedAt = new Date();
  const session = await prisma.session.create({
    data: {
      userId: administratorId,
      tokenHash: createHash("sha256")
        .update(identifier("administrator-session"), "utf8")
        .digest("hex"),
      expiresAt: new Date(authenticatedAt.getTime() + 60 * 60 * 1_000),
      passwordAuthenticatedAt: authenticatedAt,
    },
  });
  administratorSessionId = session.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("listing import persistence and application service", () => {
  it("applies only the bounded listing tables and fixed source seeds", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT "table_name"::text AS "table_name"
      FROM "information_schema"."tables"
      WHERE "table_schema" = current_schema()
        AND (
          "table_name" LIKE 'listing_%'
          OR "table_name" LIKE 'external_listing%'
        )
      ORDER BY "table_name"
    `;
    expect(tables.map((row) => row.table_name)).toEqual([
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
    ]);
    await expect(
      prisma.listingImportSource.findMany({
        orderBy: { key: "asc" },
        select: {
          key: true,
          allowedHosts: true,
          enabled: true,
          productionAllowed: true,
        },
      }),
    ).resolves.toEqual([
      {
        key: "estatesales-org",
        allowedHosts: ["estatesales.org", "www.estatesales.org"],
        enabled: true,
        productionAllowed: true,
      },
      {
        key: "fixture",
        allowedHosts: ["fixture.invalid"],
        enabled: true,
        productionAllowed: false,
      },
    ]);
  });

  it("creates an immutable review candidate without organizer publication data", async () => {
    const item = validItem(identifier("first"));
    const input = envelope("first", [item]);
    const result = await service.importBatch(input, manualContext());

    expect(result).toMatchObject({
      contractVersion: "listing-import-result.v1",
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
      rows: [
        {
          rowNumber: 1,
          status: "CANDIDATE_CREATED",
          validationCodes: [],
        },
      ],
    });
    const candidateId = result.rows[0]?.candidateId ?? "";
    expect(candidateId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u);
    await expect(
      prisma.listingSourceRecord.findFirstOrThrow({
        where: { candidate: { id: candidateId } },
        select: {
          linkedEventId: true,
          linkedExternalListingId: true,
          linkedEvent: {
            select: {
              id: true,
              paymentAttempts: { select: { id: true } },
              publication: { select: { id: true } },
            },
          },
          candidate: {
            select: { externalListing: { select: { id: true } } },
          },
        },
      }),
    ).resolves.toEqual({
      linkedEventId: null,
      linkedExternalListingId: null,
      linkedEvent: null,
      candidate: { externalListing: null },
    });

    const row = await prisma.listingImportRow.findFirstOrThrow({
      where: { batchId: result.batchId },
      select: { id: true },
    });
    await expect(
      prisma.$executeRaw`
        UPDATE "listing_import_rows"
        SET "status" = 'EXACT_DUPLICATE'
        WHERE "id" = ${row.id}::uuid
      `,
    ).rejects.toThrow(/immutable/iu);

    const audits = await prisma.auditEntry.findMany({
      where: {
        targetType: {
          in: ["LISTING_IMPORT_BATCH", "LISTING_IMPORT_CANDIDATE"],
        },
        OR: [
          { targetId: result.batchId },
          { targetId: result.rows[0]?.candidateId ?? "" },
        ],
      },
      select: { metadata: true },
    });
    const auditJson = JSON.stringify(audits);
    expect(auditJson).not.toContain("101 Example Avenue");
    expect(auditJson).not.toContain("fixture.invalid");
    expect(auditJson).not.toContain("sourceUrl");
  });

  it("rechecks active verified super-admin authority inside the import transaction", async () => {
    const email = testEmail("listing-import-ordinary-actor");
    const ordinary = await prisma.user.create({
      data: {
        displayName: "Ordinary import actor",
        email,
        normalizedEmail: email,
        passwordHash: "integration-test-password-hash",
        emailVerifiedAt: new Date(),
        role: "USER",
      },
    });
    const input = envelope("ordinary-actor", [
      validItem(identifier("ordinary-actor-item")),
    ]);

    await expect(
      service.importBatch(input, {
        transport: "MANUAL_JSON",
        actor: { kind: "ADMIN_USER", adminUserId: ordinary.id },
      }),
    ).rejects.toMatchObject({ code: "ACTOR_TRANSPORT_MISMATCH" });
    await expect(
      prisma.listingImportBatch.count({
        where: {
          ingestorRunId: input.ingestorRunId,
          ingestorInstanceId: input.ingestorInstanceId,
        },
      }),
    ).resolves.toBe(0);
  });

  it("creates, authenticates, uses, and idempotently revokes a source-scoped opaque credential", async () => {
    const created = await credentialService.create({
      sourceKey: "fixture",
      name: identifier("credential"),
      actorUserId: administratorId,
      actorSessionId: administratorSessionId,
      requestId: crypto.randomUUID(),
    });
    expect(created.rawToken).toMatch(/^esb_ing_[A-Za-z0-9_-]{43}$/u);
    expect(created.displayPrefix).toBe(created.rawToken.slice(0, 24));

    const stored = await prisma.listingIngestionCredential.findUniqueOrThrow({
      where: { id: created.credentialId },
      select: {
        tokenDigest: true,
        displayPrefix: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
    expect(stored.tokenDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(stored.tokenDigest).not.toContain(created.rawToken);
    expect(stored.displayPrefix).toBe(created.displayPrefix);
    expect(stored.lastUsedAt).toBeNull();
    expect(stored.revokedAt).toBeNull();
    await expect(
      credentialService.authenticate("wrong-token"),
    ).resolves.toBeNull();
    await expect(
      credentialService.authenticate(created.rawToken),
    ).resolves.toMatchObject({
      credentialId: created.credentialId,
      source: { key: "fixture", enabled: true },
    });

    const apiInput = envelope("credential-api", [
      validItem(identifier("credential-api-item")),
    ]);
    const requestDigest = createHash("sha256")
      .update(JSON.stringify(apiInput), "utf8")
      .digest("hex");
    const idempotencyKeyDigest = createHash("sha256")
      .update(identifier("idempotency"), "utf8")
      .digest("hex");
    const context: ListingImportCommandContext = {
      transport: "API",
      actor: {
        kind: "API_CREDENTIAL",
        credentialId: created.credentialId,
        idempotencyKeyDigest,
      },
      requestDigest,
      audit: { requestId: crypto.randomUUID() },
    };
    const imported = await service.importBatch(apiInput, context);
    const replayed = await service.importBatch(apiInput, context);
    expect(imported.replayed).toBe(false);
    expect(replayed).toMatchObject({
      batchId: imported.batchId,
      replayed: true,
    });
    await expect(
      service.importBatch(
        {
          ...apiInput,
          ingestorRunId: identifier("credential-conflict-run"),
        },
        { ...context, requestDigest: "f".repeat(64) },
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const firstRevocation = await credentialService.revoke({
      credentialId: created.credentialId,
      actorUserId: administratorId,
      actorSessionId: administratorSessionId,
      requestId: crypto.randomUUID(),
    });
    const secondRevocation = await credentialService.revoke({
      credentialId: created.credentialId,
      actorUserId: administratorId,
      actorSessionId: administratorSessionId,
      requestId: crypto.randomUUID(),
    });
    expect(firstRevocation).toMatchObject({ alreadyRevoked: false });
    expect(secondRevocation).toMatchObject({
      alreadyRevoked: true,
      revokedAt: firstRevocation?.revokedAt,
    });
    await expect(
      credentialService.authenticate(created.rawToken),
    ).resolves.toBeNull();
    await expect(
      prisma.auditEntry.count({
        where: {
          targetType: "LISTING_INGESTION_CREDENTIAL",
          targetId: created.credentialId,
          action: "LISTING_INGESTION_CREDENTIAL_REVOKED",
        },
      }),
    ).resolves.toBe(1);

    const auditJson = JSON.stringify(
      await prisma.auditEntry.findMany({
        where: {
          targetType: "LISTING_INGESTION_CREDENTIAL",
          targetId: created.credentialId,
        },
        select: { metadata: true },
      }),
    );
    expect(auditJson).not.toContain(created.rawToken);
    expect(auditJson).not.toContain(stored.tokenDigest);
  });

  it("rechecks recent super-admin authority inside credential mutations", async () => {
    const credential = await credentialService.create({
      sourceKey: "fixture",
      name: identifier("demotion-target"),
      actorUserId: administratorId,
      actorSessionId: administratorSessionId,
    });

    await prisma.user.update({
      where: { id: administratorId },
      data: { role: "USER" },
    });

    try {
      await expect(
        credentialService.create({
          sourceKey: "fixture",
          name: identifier("demoted-create"),
          actorUserId: administratorId,
          actorSessionId: administratorSessionId,
        }),
      ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
      await expect(
        credentialService.revoke({
          credentialId: credential.credentialId,
          actorUserId: administratorId,
          actorSessionId: administratorSessionId,
        }),
      ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
      await expect(
        prisma.listingIngestionCredential.findUniqueOrThrow({
          where: { id: credential.credentialId },
          select: { revokedAt: true },
        }),
      ).resolves.toEqual({ revokedAt: null });
    } finally {
      await prisma.user.update({
        where: { id: administratorId },
        data: { role: "SUPER_ADMIN" },
      });
    }
  });

  it("refuses a production credential for the fixture source", async () => {
    const productionCredentials = new ListingIngestionCredentialService(
      credentialRepository,
      new CryptoListingIngestionCredentialProvider(),
      { production: true },
    );
    const credentialName = identifier("production-fixture");

    await expect(
      productionCredentials.create({
        sourceKey: "fixture",
        name: credentialName,
        actorUserId: administratorId,
        actorSessionId: administratorSessionId,
      }),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_PRODUCTION_ALLOWED" });
    await expect(
      prisma.listingIngestionCredential.count({
        where: { name: credentialName, source: { key: "fixture" } },
      }),
    ).resolves.toBe(0);
  });

  it("rechecks the production source gate inside the persistence transaction", async () => {
    await prisma.listingImportSource.update({
      where: { key: "fixture" },
      data: { productionAllowed: true },
    });
    const gatedService = new ListingImportService(
      {
        findSourceByKey: (sourceKey) => repository.findSourceByKey(sourceKey),
        processBatchAtomically: async (input) => {
          await prisma.listingImportSource.update({
            where: { id: input.sourceId },
            data: { productionAllowed: false },
          });
          return repository.processBatchAtomically(input);
        },
      },
      "production",
    );
    const input = envelope("production-policy-race", [
      validItem(identifier("production-policy-race-item")),
    ]);

    try {
      await expect(
        gatedService.importBatch(input, manualContext()),
      ).rejects.toMatchObject({ code: "SOURCE_NOT_PRODUCTION_ALLOWED" });
      await expect(
        prisma.listingImportBatch.count({
          where: {
            ingestorInstanceId: input.ingestorInstanceId,
            ingestorRunId: input.ingestorRunId,
          },
        }),
      ).resolves.toBe(0);
    } finally {
      await prisma.listingImportSource.update({
        where: { key: "fixture" },
        data: { productionAllowed: false },
      });
    }
  });

  it("rechecks the source URL policy inside the persistence transaction", async () => {
    const policyGatedService = new ListingImportService({
      findSourceByKey: (sourceKey) => repository.findSourceByKey(sourceKey),
      processBatchAtomically: async (input) => {
        await prisma.listingImportSource.update({
          where: { id: input.sourceId },
          data: { allowedHosts: ["changed.invalid"] },
        });
        return repository.processBatchAtomically(input);
      },
    });
    const input = envelope("source-policy-race", [
      validItem(identifier("source-policy-race-item")),
    ]);

    try {
      await expect(
        policyGatedService.importBatch(input, manualContext()),
      ).rejects.toMatchObject({ code: "SOURCE_DISABLED" });
      await expect(
        prisma.listingImportBatch.count({
          where: {
            ingestorInstanceId: input.ingestorInstanceId,
            ingestorRunId: input.ingestorRunId,
          },
        }),
      ).resolves.toBe(0);
    } finally {
      await prisma.listingImportSource.update({
        where: { key: "fixture" },
        data: { allowedHosts: ["fixture.invalid"] },
      });
    }
  });

  it("normalizes the canonical JSON, CSV, and authenticated API transports to one replay-safe batch", async () => {
    const jsonInput: unknown = JSON.parse(
      readFileSync(resolve(contractFixtureRoot, "valid-request.json"), "utf8"),
    );
    const csvInput = parseListingImportCsv(
      readFileSync(resolve(contractFixtureRoot, "valid-request.csv"), "utf8"),
    );
    const fromJson = await service.importBatch(jsonInput, manualContext());
    const fromCsv = await service.importBatch(
      csvInput,
      manualContext("MANUAL_CSV"),
    );
    const credential = await credentialService.create({
      sourceKey: "fixture",
      name: identifier("transport-credential"),
      actorUserId: administratorId,
      actorSessionId: administratorSessionId,
    });
    const serialized = JSON.stringify(jsonInput);
    const idempotencyKeyDigest = createHash("sha256")
      .update(identifier("transport-key"), "utf8")
      .digest("hex");
    const fromApi = await service.importBatch(jsonInput, {
      transport: "API",
      actor: {
        kind: "API_CREDENTIAL",
        credentialId: credential.credentialId,
        idempotencyKeyDigest,
      },
      requestDigest: createHash("sha256")
        .update(serialized, "utf8")
        .digest("hex"),
    });

    expect(fromJson.replayed).toBe(false);
    expect(fromCsv).toMatchObject({
      batchId: fromJson.batchId,
      replayed: true,
    });
    expect(fromApi).toMatchObject({
      batchId: fromJson.batchId,
      replayed: true,
    });
    await expect(
      prisma.listingImportIdempotencyKey.findUnique({
        where: {
          credentialId_idempotencyKeyDigest: {
            credentialId: credential.credentialId,
            idempotencyKeyDigest,
          },
        },
      }),
    ).resolves.toMatchObject({ batchId: fromJson.batchId });
    const changedInput = envelope("transport-key-reuse", [
      validItem(identifier("transport-key-reuse-item")),
    ]);
    await expect(
      service.importBatch(changedInput, {
        transport: "API",
        actor: {
          kind: "API_CREDENTIAL",
          credentialId: credential.credentialId,
          idempotencyKeyDigest,
        },
        requestDigest: createHash("sha256")
          .update(JSON.stringify(changedInput), "utf8")
          .digest("hex"),
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      prisma.listingImportBatch.count({ where: { id: fromJson.batchId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.listingImportCandidate.count({
        where: { id: fromJson.rows[0]?.candidateId ?? "" },
      }),
    ).resolves.toBe(1);
  });

  it("processes authenticated HTTP ingestion, replays idempotently, conflicts safely, and rejects revoked tokens", async () => {
    const credential = await credentialService.create({
      sourceKey: "fixture",
      name: identifier("http-credential"),
      actorUserId: administratorId,
      actorSessionId: administratorSessionId,
    });
    const sourceListingId = identifier("http-listing");
    const input = envelope("http-ingestion", [validItem(sourceListingId)]);
    const body = JSON.stringify(input);
    const idempotencyKey = `integration-http-${crypto.randomUUID()}`;
    const rateLimit = {
      assertNetworkAllowed: async () => undefined,
      assertCredentialAllowed: async () => undefined,
    };
    const httpRequest = (requestBody: string, bearer = credential.rawToken) =>
      new Request("http://localhost:3000/api/ingestion/v1/listing-batches", {
        method: "POST",
        body: requestBody,
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-request-id": "listing-import-http-integration",
        },
      });
    const dependencies = {
      credentials: credentialService,
      imports: service,
      rateLimit,
    };
    const first = await handleListingIngestionRequest(
      httpRequest(body),
      dependencies,
    );
    const replay = await handleListingIngestionRequest(
      httpRequest(body),
      dependencies,
    );
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    const firstResult = (await first.json()) as {
      batchId: string;
      rows: readonly { candidateId: string | null }[];
    };
    await expect(replay.json()).resolves.toMatchObject({
      batchId: firstResult.batchId,
      replayed: true,
    });

    const conflict = await handleListingIngestionRequest(
      httpRequest(
        JSON.stringify({
          ...input,
          ingestorRunId: identifier("http-conflict"),
        }),
      ),
      dependencies,
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });

    const wrong = await handleListingIngestionRequest(
      httpRequest(body, `esb_ing_${"Z".repeat(43)}`),
      dependencies,
    );
    await credentialService.revoke({
      credentialId: credential.credentialId,
      actorUserId: administratorId,
      actorSessionId: administratorSessionId,
    });
    const revoked = await handleListingIngestionRequest(
      httpRequest(body),
      dependencies,
    );
    expect(wrong.status).toBe(401);
    expect(revoked.status).toBe(401);
    expect(await wrong.json()).toEqual(await revoked.json());

    const candidateId = firstResult.rows[0]?.candidateId ?? "";
    await expect(
      prisma.listingImportBatch.count({ where: { id: firstResult.batchId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.listingSourceRecord.findFirstOrThrow({
        where: { sourceListingId, source: { key: "fixture" } },
        select: {
          candidate: { select: { id: true } },
          externalListing: { select: { id: true } },
          linkedEventId: true,
          linkedExternalListingId: true,
        },
      }),
    ).resolves.toEqual({
      candidate: { id: candidateId },
      externalListing: null,
      linkedEventId: null,
      linkedExternalListingId: null,
    });
  });

  it("replays runs, detects exact repeats, and preserves the pending payload on change", async () => {
    const sourceListingId = identifier("repeat-source");
    const sourceUrl = `https://fixture.invalid/listings/${sourceListingId}`;
    const initial = validItem(sourceListingId, { sourceListingId, sourceUrl });
    const initialEnvelope = envelope("repeat-initial", [initial]);
    const first = await service.importBatch(initialEnvelope, manualContext());
    const repeated = validItem(sourceListingId, {
      sourceListingId,
      sourceUrl,
      retrievedAt: "2026-08-05T16:00:00.000Z",
    });
    const exactEnvelope = envelope("repeat-exact", [repeated]);
    const exact = await service.importBatch(exactEnvelope, manualContext());
    expect(exact.rows[0]).toMatchObject({
      status: "EXACT_DUPLICATE",
      candidateId: null,
    });

    const replay = await service.importBatch(
      exactEnvelope,
      manualContext("MANUAL_CSV"),
    );
    expect(replay).toMatchObject({
      batchId: exact.batchId,
      replayed: true,
      counts: exact.counts,
    });

    const changed = validItem(sourceListingId, {
      sourceListingId,
      sourceUrl,
      retrievedAt: "2026-08-06T16:00:00.000Z",
      title: "Changed Fixture Estate Sale",
    });
    const changedEnvelope = envelope("repeat-changed", [changed]);
    const changedResult = await service.importBatch(
      changedEnvelope,
      manualContext(),
    );
    expect(changedResult.rows[0]).toMatchObject({
      status: "SOURCE_CHANGED",
      candidateId: null,
    });
    const candidate = await prisma.listingImportCandidate.findUniqueOrThrow({
      where: { id: first.rows[0]?.candidateId ?? "" },
      select: { currentPayload: true },
    });
    expect(candidate.currentPayload).toMatchObject({
      title: "Fixture Estate Sale",
    });
    const changedObservation = await prisma.listingImportRow.findFirstOrThrow({
      where: { batchId: changedResult.batchId, rowNumber: 1 },
      select: { id: true },
    });
    await prisma.listingImportCandidate.update({
      where: { id: first.rows[0]?.candidateId ?? "" },
      data: {
        latestObservationId: changedObservation.id,
        version: { increment: 1 },
      },
    });
    const initialReplay = await service.importBatch(
      initialEnvelope,
      manualContext("MANUAL_CSV"),
    );
    expect(initialReplay.rows[0]).toMatchObject({
      status: "CANDIDATE_CREATED",
      candidateId: first.rows[0]?.candidateId,
    });

    await expect(
      service.importBatch(
        {
          ...changedEnvelope,
          items: [
            validItem(sourceListingId, {
              sourceListingId,
              sourceUrl,
              title: "A second incompatible change",
            }),
          ],
        },
        manualContext(),
      ),
    ).rejects.toMatchObject({
      code: "RUN_IDENTITY_CONFLICT",
    });
  });

  it("retains primitive invalid rows and canonical URL identity conflicts in a partial batch", async () => {
    const baseId = identifier("partial-base");
    const sourceUrl = `https://fixture.invalid/listings/${baseId}`;
    const input = envelope("partial", [
      validItem(baseId, { sourceListingId: baseId, sourceUrl }),
      null,
      validItem(identifier("partial-conflict"), { sourceUrl }),
    ]);
    const result = await service.importBatch(input, manualContext());

    expect(result.status).toBe("PARTIAL");
    expect(result.counts).toEqual({
      total: 3,
      candidateCreated: 1,
      invalid: 1,
      exactDuplicate: 0,
      sourceChanged: 0,
      identityConflict: 1,
    });
    expect(result.rows.map((row) => row.status)).toEqual([
      "CANDIDATE_CREATED",
      "INVALID",
      "IDENTITY_CONFLICT",
    ]);
    const invalid = await prisma.listingImportRow.findFirstOrThrow({
      where: { batchId: result.batchId, rowNumber: 2 },
      select: { inputJson: true, validationFailures: true },
    });
    expect(invalid.inputJson).toBeNull();
    expect(invalid.validationFailures).toEqual(["ITEM_INVALID"]);
  });

  it("can reuse a canonical URL released earlier in the same batch", async () => {
    const originalSourceId = identifier("moved-url-source");
    const originalUrl = `https://fixture.invalid/listings/${originalSourceId}`;
    await service.importBatch(
      envelope("moved-url-initial", [
        validItem(originalSourceId, {
          sourceListingId: originalSourceId,
          sourceUrl: originalUrl,
        }),
      ]),
      manualContext(),
    );

    const replacementSourceId = identifier("released-url-source");
    const movedUrl = `https://fixture.invalid/listings/${originalSourceId}-moved`;
    const result = await service.importBatch(
      envelope("released-url-reuse", [
        validItem(originalSourceId, {
          sourceListingId: originalSourceId,
          sourceUrl: movedUrl,
          retrievedAt: "2026-08-07T16:00:00.000Z",
        }),
        validItem(replacementSourceId, {
          sourceListingId: replacementSourceId,
          sourceUrl: originalUrl,
          retrievedAt: "2026-08-07T16:01:00.000Z",
        }),
      ]),
      manualContext(),
    );

    expect(result.rows.map((row) => row.status)).toEqual([
      "EXACT_DUPLICATE",
      "CANDIDATE_CREATED",
    ]);
    await expect(
      prisma.listingSourceRecord.findMany({
        where: {
          sourceListingId: { in: [originalSourceId, replacementSourceId] },
        },
        orderBy: { sourceListingId: "asc" },
        select: { sourceListingId: true, canonicalSourceUrl: true },
      }),
    ).resolves.toEqual(
      [
        { sourceListingId: originalSourceId, canonicalSourceUrl: movedUrl },
        {
          sourceListingId: replacementSourceId,
          canonicalSourceUrl: originalUrl,
        },
      ].sort((left, right) =>
        left.sourceListingId.localeCompare(right.sourceListingId),
      ),
    );
  });

  it("stores deterministic probable-match warnings without linking or merging", async () => {
    const ownerEmail = testEmail("listing-import-duplicate-owner");
    const owner = await prisma.user.create({
      data: {
        displayName: "Duplicate Fixture Owner",
        email: ownerEmail,
        normalizedEmail: ownerEmail,
        passwordHash: "integration-test-password-hash",
        organizerProfile: { create: { status: "INCOMPLETE" } },
      },
      include: { organizerProfile: true },
    });
    const schedule = normalizeListingContent({
      eventType: "ESTATE_SALE",
      title: "Warehouse Treasure Sale",
      description:
        "A deterministic duplicate fixture with furniture and household goods.",
      localStartsAt: "2026-09-12T09:00",
      localEndsAt: "2026-09-13T15:00",
      timezone: "America/Los_Angeles",
      addressLine1: "500 Match Street",
      addressLine2: null,
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      privacyMode: "APPROXIMATE_LOCATION",
    });
    const event = await prisma.event.create({
      data: {
        organizerId: owner.organizerProfile?.id ?? "",
        publicId: crypto.randomUUID().replaceAll("-", "").slice(0, 12),
        slug: "warehouse-treasure-sale",
        title: schedule.title,
        description: schedule.description,
        eventType: "ESTATE_SALE",
        localStartsAt: schedule.localStartsAt,
        localEndsAt: schedule.localEndsAt,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        timezone: schedule.timezone,
        privacyMode: "APPROXIMATE_LOCATION",
        location: {
          create: {
            addressLine1: "500 Match Street",
            city: "Bakersfield",
            region: "CA",
            postalCode: "93301",
            countryCode: "US",
            normalizedAddress: "500 Match Street, Bakersfield, CA 93301, US",
            timezone: "America/Los_Angeles",
            validationStatus: "UNVALIDATED",
          },
        },
      },
    });

    const sourceId = identifier("probable-match");
    const result = await service.importBatch(
      envelope("probable-match", [
        validItem(sourceId, {
          sourceListingId: sourceId,
          title: "Warehouse Treasure Sale",
          description:
            "A deterministic duplicate fixture with furniture and household goods.",
          addressLine1: "500 Match Street",
        }),
      ]),
      manualContext(),
    );
    const match = await prisma.listingDuplicateMatch.findFirstOrThrow({
      where: {
        candidateId: result.rows[0]?.candidateId ?? "",
        eventId: event.id,
      },
      select: { reasons: true, resolution: true },
    });
    expect(match).toEqual({
      reasons: expect.arrayContaining([
        "FULL_ADDRESS_SCHEDULE_OVERLAP",
        "TITLE_POSTAL_DATE_SIMILARITY",
      ]),
      resolution: "UNRESOLVED",
    });
    await expect(
      prisma.externalListing.count({
        where: { candidateId: result.rows[0]?.candidateId ?? "" },
      }),
    ).resolves.toBe(0);
  });

  it("persists the documented 200-row valid batch within the transaction budget", async () => {
    const items = Array.from({ length: 200 }, (_, index) => {
      const sourceListingId = identifier(`maximum-batch-${String(index)}`);
      return validItem(sourceListingId, { sourceListingId });
    });
    const startedAt = performance.now();
    const result = await service.importBatch(
      envelope("maximum-valid-batch", items),
      manualContext(),
    );
    const durationMilliseconds = performance.now() - startedAt;

    expect(result).toMatchObject({
      replayed: false,
      status: "COMPLETED",
      counts: {
        total: 200,
        candidateCreated: 200,
        invalid: 0,
        exactDuplicate: 0,
        sourceChanged: 0,
        identityConflict: 0,
      },
    });
    expect(result.rows).toHaveLength(200);
    expect(durationMilliseconds).toBeLessThan(15_000);
  }, 30_000);

  it("persists the documented 200-row invalid batch within the transaction budget", async () => {
    const startedAt = performance.now();
    const result = await service.importBatch(
      envelope(
        "maximum-invalid-batch",
        Array.from({ length: 200 }, () => ({ title: "No" })),
      ),
      manualContext(),
    );
    const durationMilliseconds = performance.now() - startedAt;

    expect(result).toMatchObject({
      replayed: false,
      status: "REJECTED",
      counts: {
        total: 200,
        candidateCreated: 0,
        invalid: 200,
        exactDuplicate: 0,
        sourceChanged: 0,
        identityConflict: 0,
      },
    });
    expect(result.rows).toHaveLength(200);
    expect(durationMilliseconds).toBeLessThan(15_000);
  }, 30_000);

  it("serializes concurrent duplicate submissions into one batch", async () => {
    const sourceId = identifier("concurrent-source");
    const input = envelope("concurrent", [
      validItem(sourceId, { sourceListingId: sourceId }),
    ]);
    const [left, right] = await Promise.all([
      service.importBatch(input, manualContext()),
      service.importBatch(input, manualContext()),
    ]);
    expect(left.batchId).toBe(right.batchId);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    await expect(
      prisma.listingImportBatch.count({ where: { id: left.batchId } }),
    ).resolves.toBe(1);
  });
});
