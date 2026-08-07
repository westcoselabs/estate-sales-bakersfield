import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  CryptoListingIngestionCredentialProvider,
  ListingIngestionCredentialService,
  type ListingIngestionCredentialRepository,
  type ListingIngestionCredentialTokenProvider,
} from "@/modules/listing-imports";

const now = new Date("2026-08-04T20:00:00.000Z");
const rawToken = `esb_ing_${"A".repeat(43)}`;

function repository(
  overrides: Partial<ListingIngestionCredentialRepository> = {},
): ListingIngestionCredentialRepository {
  return {
    createAtomically: vi.fn(async (input) => ({
      status: "CREATED" as const,
      credentialId: "credential-1",
      sourceId: "source-1",
      sourceKey: input.sourceKey,
      name: input.name,
      displayPrefix: input.displayPrefix,
      createdAt: input.createdAt,
    })),
    revokeAtomically: vi.fn(async (input) => ({
      status: "REVOKED" as const,
      credentialId: input.credentialId,
      sourceId: "source-1",
      revokedAt: input.revokedAt,
      alreadyRevoked: false,
    })),
    authenticateActive: vi.fn(async () => null),
    ...overrides,
  };
}

function tokenProvider(
  overrides: Partial<ListingIngestionCredentialTokenProvider> = {},
): ListingIngestionCredentialTokenProvider {
  return {
    generate: vi.fn(() => rawToken),
    hash: vi.fn((token) =>
      createHash("sha256").update(token, "utf8").digest("hex"),
    ),
    displayPrefix: vi.fn((token) => token.slice(0, 24)),
    isWellFormed: vi.fn((token) => /^esb_ing_[A-Za-z0-9_-]{43}$/u.test(token)),
    ...overrides,
  };
}

describe("ListingIngestionCredentialService", () => {
  it("returns a newly generated raw token once while persisting only its digest and prefix", async () => {
    const credentials = repository();
    const service = new ListingIngestionCredentialService(
      credentials,
      tokenProvider(),
      { production: false, now: () => now },
    );

    await expect(
      service.create({
        sourceKey: " fixture ",
        name: " Local crawler ",
        actorUserId: "admin-1",
        actorSessionId: "session-1",
        requestId: "request-1",
      }),
    ).resolves.toEqual({
      credentialId: "credential-1",
      sourceId: "source-1",
      sourceKey: "fixture",
      name: "Local crawler",
      displayPrefix: rawToken.slice(0, 24),
      rawToken,
      createdAt: now,
    });

    expect(credentials.createAtomically).toHaveBeenCalledWith({
      sourceKey: "fixture",
      name: "Local crawler",
      tokenDigest: createHash("sha256").update(rawToken, "utf8").digest("hex"),
      displayPrefix: rawToken.slice(0, 24),
      createdByUserId: "admin-1",
      actorSessionId: "session-1",
      authorizationAt: now,
      createdAt: now,
      requireProductionAllowed: false,
      requestId: "request-1",
    });
    expect(
      vi.mocked(credentials.createAtomically).mock.calls[0]?.[0],
    ).not.toHaveProperty("rawToken");
  });

  it("retries digest collisions but never more than three attempts", async () => {
    const credentials = repository({
      createAtomically: vi.fn(async () => ({
        status: "TOKEN_DIGEST_CONFLICT" as const,
      })),
    });
    const tokens = tokenProvider();

    await expect(
      new ListingIngestionCredentialService(credentials, tokens, {
        production: false,
        now: () => now,
      }).create({
        sourceKey: "fixture",
        name: "Crawler",
        actorUserId: "admin-1",
        actorSessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "TOKEN_GENERATION_FAILED" });
    expect(credentials.createAtomically).toHaveBeenCalledTimes(3);
    expect(tokens.generate).toHaveBeenCalledTimes(3);
  });

  it("enforces source production policy during creation", async () => {
    const credentials = repository({
      createAtomically: vi.fn(async () => ({
        status: "SOURCE_NOT_PRODUCTION_ALLOWED" as const,
      })),
    });

    await expect(
      new ListingIngestionCredentialService(credentials, tokenProvider(), {
        production: true,
      }).create({
        sourceKey: "fixture",
        name: "Crawler",
        actorUserId: "admin-1",
        actorSessionId: "session-1",
      }),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_PRODUCTION_ALLOWED" });
    expect(credentials.createAtomically).toHaveBeenCalledWith(
      expect.objectContaining({ requireProductionAllowed: true }),
    );
  });

  it("makes missing, malformed, wrong, revoked, and disabled credentials indistinguishable", async () => {
    const authenticateActive = vi.fn(async () => null);
    const credentials = repository({ authenticateActive });
    const service = new ListingIngestionCredentialService(
      credentials,
      tokenProvider(),
      { production: true, now: () => now },
    );

    await expect(service.authenticate(null)).resolves.toBeNull();
    await expect(service.authenticate("wrong-token")).resolves.toBeNull();
    await expect(service.authenticate(rawToken)).resolves.toBeNull();
    expect(authenticateActive).toHaveBeenCalledOnce();
    expect(authenticateActive).toHaveBeenCalledWith({
      tokenDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      authenticatedAt: now,
      requireProductionAllowed: true,
    });
  });

  it("preserves an idempotent revoke result and returns null for an unknown id", async () => {
    const revokedAt = new Date("2026-08-04T19:00:00.000Z");
    const credentials = repository({
      revokeAtomically: vi
        .fn()
        .mockResolvedValueOnce({
          status: "REVOKED",
          credentialId: "credential-1",
          sourceId: "source-1",
          revokedAt,
          alreadyRevoked: true,
        })
        .mockResolvedValueOnce({ status: "NOT_FOUND" }),
    });
    const service = new ListingIngestionCredentialService(
      credentials,
      tokenProvider(),
      { production: false, now: () => now },
    );

    await expect(
      service.revoke({
        credentialId: "credential-1",
        actorUserId: "admin-1",
        actorSessionId: "session-1",
      }),
    ).resolves.toMatchObject({ alreadyRevoked: true, revokedAt });
    await expect(
      service.revoke({
        credentialId: "missing",
        actorUserId: "admin-1",
        actorSessionId: "session-1",
      }),
    ).resolves.toBeNull();
  });

  it("fails closed when transactional administrator authorization is stale", async () => {
    const credentials = repository({
      createAtomically: vi.fn(async () => ({
        status: "ACTOR_NOT_AUTHORIZED" as const,
      })),
      revokeAtomically: vi.fn(async () => ({
        status: "ACTOR_NOT_AUTHORIZED" as const,
      })),
    });
    const service = new ListingIngestionCredentialService(
      credentials,
      tokenProvider(),
      { production: false, now: () => now },
    );

    await expect(
      service.create({
        sourceKey: "fixture",
        name: "Crawler",
        actorUserId: "admin-1",
        actorSessionId: "stale-session",
      }),
    ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
    await expect(
      service.revoke({
        credentialId: "credential-1",
        actorUserId: "admin-1",
        actorSessionId: "stale-session",
      }),
    ).rejects.toMatchObject({ code: "ACTOR_NOT_AUTHORIZED" });
  });
});

describe("CryptoListingIngestionCredentialProvider", () => {
  it("generates the exact opaque token format, literal display prefix, and SHA-256 digest", () => {
    const provider = new CryptoListingIngestionCredentialProvider();
    const token = provider.generate();

    expect(token).toMatch(/^esb_ing_[A-Za-z0-9_-]{43}$/u);
    expect(provider.isWellFormed(token)).toBe(true);
    expect(provider.displayPrefix(token)).toBe(token.slice(0, 24));
    expect(provider.displayPrefix(token)).not.toContain("…");
    expect(provider.hash(token)).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
  });
});
