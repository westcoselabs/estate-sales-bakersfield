import { describe, expect, it, vi } from "vitest";

import { AuthenticationServiceUnavailableError } from "@/modules/auth/domain/errors";
import {
  authenticationRateLimitIdentifierHash,
  authenticationRateLimitScopeHash,
  type AuthenticationRateLimitDatabase,
  PrismaAuthenticationRateLimiter,
} from "@/modules/auth/infrastructure/prisma-authentication-rate-limiter";

function databaseWith(input?: {
  readonly count?: number;
  readonly expiresAt?: Date;
  readonly failure?: Error;
}) {
  return {
    $queryRaw: vi.fn(async (...parameters: unknown[]) => {
      void parameters;
      if (input?.failure) throw input.failure;
      return [
        {
          attempt_count: input?.count ?? 1,
          expires_at: input?.expiresAt ?? new Date("2026-07-21T12:01:00Z"),
          evaluated_at: new Date("2026-07-21T12:00:00Z"),
        },
      ];
    }),
    $executeRaw: vi.fn(async (...parameters: unknown[]) => {
      void parameters;
      if (input?.failure) throw input.failure;
      return 2;
    }),
  };
}

const request = {
  namespace: "login:subject",
  identifier: "privacy-safe-fingerprint",
  limit: 5,
  windowSeconds: 60,
} as const;

describe("PrismaAuthenticationRateLimiter", () => {
  it("maps an atomic bucket result at and above the threshold", async () => {
    const allowedDatabase = databaseWith({ count: 5 });
    const deniedDatabase = databaseWith({ count: 6 });
    const allowed = new PrismaAuthenticationRateLimiter(
      allowedDatabase as unknown as AuthenticationRateLimitDatabase,
      { environment: "preview" },
    );
    const denied = new PrismaAuthenticationRateLimiter(
      deniedDatabase as unknown as AuthenticationRateLimitDatabase,
      { environment: "preview" },
    );

    await expect(allowed.consume(request)).resolves.toEqual({
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    await expect(denied.consume(request)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    const query = allowedDatabase.$queryRaw.mock.calls[0]?.[0] as
      { values?: unknown[] } | undefined;
    expect(query?.values).not.toContain(request.identifier);
    expect(query?.values).toContain("preview");
    expect(query?.values).toContain(request.namespace);
  });

  it("uses environment and test scope in irreversible SHA-256 keys", () => {
    const shared = authenticationRateLimitScopeHash("test");
    const firstRun = authenticationRateLimitScopeHash(
      "test",
      "testrun-first-1234",
    );
    const secondRun = authenticationRateLimitScopeHash(
      "test",
      "testrun-second-1234",
    );
    const previewIdentifier = authenticationRateLimitIdentifierHash({
      environment: "preview",
      scopeHash: authenticationRateLimitScopeHash("preview"),
      namespace: request.namespace,
      identifier: "person@example.test",
    });
    const productionIdentifier = authenticationRateLimitIdentifierHash({
      environment: "production",
      scopeHash: authenticationRateLimitScopeHash("production"),
      namespace: request.namespace,
      identifier: "person@example.test",
    });

    for (const value of [
      shared,
      firstRun,
      secondRun,
      previewIdentifier,
      productionIdentifier,
    ]) {
      expect(value).toMatch(/^[0-9a-f]{64}$/);
      expect(value).not.toContain("person@example.test");
    }
    expect(new Set([shared, firstRun, secondRun])).toHaveLength(3);
    expect(previewIdentifier).not.toBe(productionIdentifier);
  });

  it("fails closed with a sanitized application error on database failure", async () => {
    const database = databaseWith({ failure: new Error("database offline") });
    const limiter = new PrismaAuthenticationRateLimiter(
      database as unknown as AuthenticationRateLimitDatabase,
      { environment: "local" },
    );

    await expect(limiter.consume(request)).rejects.toBeInstanceOf(
      AuthenticationServiceUnavailableError,
    );
    await expect(limiter.deleteExpired()).rejects.toBeInstanceOf(
      AuthenticationServiceUnavailableError,
    );
  });

  it("deletes only expired buckets through the maintenance operation", async () => {
    const database = databaseWith();
    const limiter = new PrismaAuthenticationRateLimiter(
      database as unknown as AuthenticationRateLimitDatabase,
      { environment: "test" },
    );

    await expect(limiter.deleteExpired()).resolves.toBe(2);
    expect(database.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
