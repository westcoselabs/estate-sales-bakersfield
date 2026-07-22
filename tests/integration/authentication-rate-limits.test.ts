import { createHash, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import type { RateLimitEnvironment } from "@/modules/auth/infrastructure/prisma-authentication-rate-limiter";
import {
  authenticationRateLimitIdentifierHash,
  authenticationRateLimitScopeHash,
  PrismaAuthenticationRateLimiter,
} from "@/modules/auth/infrastructure/prisma-authentication-rate-limiter";

import { createIntegrationClient } from "./support/database";
import { testRunId } from "./support/test-run";

const prisma = createIntegrationClient();
const ownedScopes = new Map<
  string,
  {
    environment: RateLimitEnvironment;
    scopeHash: string;
  }
>();

function fingerprint(label: string): string {
  return createHash("sha256")
    .update(`${testRunId()}:${label}:${randomUUID()}`, "utf8")
    .digest("hex");
}

function fixture(
  label: string,
  input?: { readonly environment?: RateLimitEnvironment },
) {
  const environment = input?.environment ?? "test";
  const scope = `${testRunId()}-${label}`;
  const scopeHash = authenticationRateLimitScopeHash(environment, scope);
  ownedScopes.set(`${environment}:${scopeHash}`, { environment, scopeHash });
  return {
    environment,
    limiter: new PrismaAuthenticationRateLimiter(prisma, {
      environment,
      scope,
    }),
    scopeHash,
  };
}

afterAll(async () => {
  const scopes = [...ownedScopes.values()];
  if (scopes.length > 0) {
    await prisma.authenticationRateLimitBucket.deleteMany({
      where: {
        OR: scopes.map(({ environment, scopeHash }) => ({
          environment,
          scopeHash,
        })),
      },
    });
  }
  await prisma.$disconnect();
});

describe("PostgreSQL authentication rate limits", () => {
  it("enforces thresholds and resets an expired fixed window", async () => {
    const { environment, limiter, scopeHash } = fixture("threshold-expiry");
    const input = {
      namespace: "register:subject",
      identifier: fingerprint("threshold-expiry"),
      limit: 3,
      windowSeconds: 60,
    } as const;

    const decisions = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      decisions.push(await limiter.consume(input));
    }
    expect(decisions.map((decision) => decision.allowed)).toEqual([
      true,
      true,
      true,
      false,
    ]);

    const identifierHash = authenticationRateLimitIdentifierHash({
      environment,
      scopeHash,
      namespace: input.namespace,
      identifier: input.identifier,
    });
    await prisma.authenticationRateLimitBucket.update({
      where: {
        environment_scopeHash_namespace_identifierHash: {
          environment,
          scopeHash,
          namespace: input.namespace,
          identifierHash,
        },
      },
      data: {
        windowStartedAt: new Date("2000-01-01T00:00:00Z"),
        expiresAt: new Date("2000-01-01T00:01:00Z"),
      },
    });
    await expect(limiter.consume(input)).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
    });
  });

  it("allows exactly the threshold under concurrent consumers", async () => {
    const { environment, limiter, scopeHash } = fixture("concurrency");
    const input = {
      namespace: "login:network",
      identifier: fingerprint("concurrency"),
      limit: 5,
      windowSeconds: 300,
    } as const;

    const decisions = await Promise.all(
      Array.from({ length: 24 }, () => limiter.consume(input)),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    const identifierHash = authenticationRateLimitIdentifierHash({
      environment,
      scopeHash,
      namespace: input.namespace,
      identifier: input.identifier,
    });
    const bucket = await prisma.authenticationRateLimitBucket.findFirstOrThrow({
      where: {
        environment,
        scopeHash,
        namespace: input.namespace,
        identifierHash,
      },
    });
    expect(bucket.attemptCount).toBe(24);
    expect(JSON.stringify(bucket)).not.toContain(input.identifier);
  });

  it("isolates identical workflow identifiers by application environment", async () => {
    const test = fixture("environment", { environment: "test" });
    const local = fixture("environment", {
      environment: "local",
    });
    const input = {
      namespace: "forgot_password:subject",
      identifier: fingerprint("environment"),
      limit: 1,
      windowSeconds: 60,
    } as const;

    await expect(test.limiter.consume(input)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(test.limiter.consume(input)).resolves.toMatchObject({
      allowed: false,
    });
    await expect(local.limiter.consume(input)).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("cleans only expired buckets in the current environment scope", async () => {
    const expired = fixture("cleanup-expired");
    const retained = fixture("cleanup-retained");
    const input = {
      namespace: "reset_password:network",
      identifier: fingerprint("cleanup"),
      limit: 2,
      windowSeconds: 60,
    } as const;
    await expired.limiter.consume(input);
    await retained.limiter.consume(input);

    await prisma.authenticationRateLimitBucket.updateMany({
      where: {
        environment: expired.environment,
        scopeHash: expired.scopeHash,
      },
      data: {
        windowStartedAt: new Date("2000-01-01T00:00:00Z"),
        expiresAt: new Date("2000-01-01T00:01:00Z"),
      },
    });
    await expect(expired.limiter.deleteExpiredForCurrentScope()).resolves.toBe(
      1,
    );
    await expect(
      prisma.authenticationRateLimitBucket.count({
        where: {
          environment: retained.environment,
          scopeHash: retained.scopeHash,
        },
      }),
    ).resolves.toBe(1);
  });
});
