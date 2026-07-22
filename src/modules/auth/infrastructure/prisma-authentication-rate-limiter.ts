import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/platform/observability/logger";

import type { RateLimitDecision, RateLimiter } from "../application/ports";
import { AuthenticationServiceUnavailableError } from "../domain/errors";

export type RateLimitEnvironment = "local" | "test" | "preview" | "production";

export interface AuthenticationRateLimitDatabase {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
}

interface RateLimitBucketRow {
  attempt_count: number;
  expires_at: Date;
  evaluated_at: Date;
}

const ENVIRONMENTS: readonly RateLimitEnvironment[] = [
  "local",
  "test",
  "preview",
  "production",
];
const NAMESPACE_PATTERN = /^[a-z][a-z0-9:_-]{0,63}$/;
const MAX_IDENTIFIER_LENGTH = 1024;
const MAX_LIMIT = 10_000;
const MAX_WINDOW_SECONDS = 7 * 24 * 60 * 60;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function authenticationRateLimitScopeHash(
  environment: RateLimitEnvironment,
  scope?: string,
): string {
  return sha256(
    `auth-rate-limit-scope:v1\u0000${environment}\u0000${scope ?? "shared"}`,
  );
}

export function authenticationRateLimitIdentifierHash(input: {
  readonly environment: RateLimitEnvironment;
  readonly scopeHash: string;
  readonly namespace: string;
  readonly identifier: string;
}): string {
  return sha256(
    `auth-rate-limit-identifier:v1\u0000${input.environment}\u0000${input.scopeHash}\u0000${input.namespace}\u0000${input.identifier}`,
  );
}

function assertRateLimitInput(
  input: Parameters<RateLimiter["consume"]>[0],
): void {
  if (!NAMESPACE_PATTERN.test(input.namespace)) {
    throw new Error("The rate-limit namespace is invalid");
  }
  if (
    input.identifier.length < 1 ||
    input.identifier.length > MAX_IDENTIFIER_LENGTH
  ) {
    throw new Error("The rate-limit identifier is invalid");
  }
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_LIMIT
  ) {
    throw new Error("The rate-limit threshold is invalid");
  }
  if (
    !Number.isInteger(input.windowSeconds) ||
    input.windowSeconds < 1 ||
    input.windowSeconds > MAX_WINDOW_SECONDS
  ) {
    throw new Error("The rate-limit window is invalid");
  }
}

export class PrismaAuthenticationRateLimiter implements RateLimiter {
  private readonly environment: RateLimitEnvironment;
  private readonly scopeHash: string;

  constructor(
    private readonly database: AuthenticationRateLimitDatabase,
    input: {
      readonly environment: RateLimitEnvironment;
      readonly scope?: string;
    },
  ) {
    if (!ENVIRONMENTS.includes(input.environment)) {
      throw new Error("The rate-limit environment namespace is invalid");
    }
    if (input.scope !== undefined && input.scope.length > 100) {
      throw new Error("The rate-limit isolation scope is invalid");
    }
    this.environment = input.environment;
    this.scopeHash = authenticationRateLimitScopeHash(
      input.environment,
      input.scope,
    );
  }

  async consume(
    input: Parameters<RateLimiter["consume"]>[0],
  ): Promise<RateLimitDecision> {
    try {
      assertRateLimitInput(input);
      const identifierHash = authenticationRateLimitIdentifierHash({
        environment: this.environment,
        scopeHash: this.scopeHash,
        namespace: input.namespace,
        identifier: input.identifier,
      });
      const rows = await this.database.$queryRaw<RateLimitBucketRow[]>(
        Prisma.sql`
          INSERT INTO "authentication_rate_limit_buckets" (
            "environment",
            "scope_hash",
            "namespace",
            "identifier_hash",
            "attempt_count",
            "window_started_at",
            "expires_at",
            "updated_at"
          ) VALUES (
            ${this.environment},
            ${this.scopeHash},
            ${input.namespace},
            ${identifierHash},
            1,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP + ${input.windowSeconds} * INTERVAL '1 second',
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (
            "environment", "scope_hash", "namespace", "identifier_hash"
          ) DO UPDATE SET
            "attempt_count" = CASE
              WHEN "authentication_rate_limit_buckets"."expires_at" <= CURRENT_TIMESTAMP
                THEN 1
              ELSE LEAST(
                "authentication_rate_limit_buckets"."attempt_count" + 1,
                ${MAX_LIMIT + 1}
              )
            END,
            "window_started_at" = CASE
              WHEN "authentication_rate_limit_buckets"."expires_at" <= CURRENT_TIMESTAMP
                THEN CURRENT_TIMESTAMP
              ELSE "authentication_rate_limit_buckets"."window_started_at"
            END,
            "expires_at" = CASE
              WHEN "authentication_rate_limit_buckets"."expires_at" <= CURRENT_TIMESTAMP
                THEN CURRENT_TIMESTAMP + ${input.windowSeconds} * INTERVAL '1 second'
              ELSE "authentication_rate_limit_buckets"."expires_at"
            END,
            "updated_at" = CURRENT_TIMESTAMP
          RETURNING "attempt_count", "expires_at", CURRENT_TIMESTAMP AS "evaluated_at"
        `,
      );
      const row = rows[0];
      if (
        !row ||
        !Number.isInteger(row.attempt_count) ||
        !(row.expires_at instanceof Date) ||
        !(row.evaluated_at instanceof Date)
      ) {
        throw new Error("The rate-limit database returned invalid data");
      }
      return {
        allowed: row.attempt_count <= input.limit,
        remaining: Math.max(input.limit - row.attempt_count, 0),
        retryAfterSeconds: Math.max(
          Math.ceil(
            (row.expires_at.getTime() - row.evaluated_at.getTime()) / 1000,
          ),
          1,
        ),
      };
    } catch (cause) {
      logger.error(
        {
          errorType:
            cause instanceof Error ? cause.name : "UnknownRateLimitError",
          namespace: NAMESPACE_PATTERN.test(input.namespace)
            ? input.namespace
            : "invalid",
        },
        "Authentication rate-limit database operation failed",
      );
      throw new AuthenticationServiceUnavailableError(
        "Authentication abuse controls are unavailable",
        { cause },
      );
    }
  }

  async deleteExpired(): Promise<number> {
    return this.deleteExpiredMatchingScope(false);
  }

  async deleteExpiredForCurrentScope(): Promise<number> {
    return this.deleteExpiredMatchingScope(true);
  }

  private async deleteExpiredMatchingScope(
    scopeOnly: boolean,
  ): Promise<number> {
    try {
      return scopeOnly
        ? await this.database.$executeRaw(Prisma.sql`
            DELETE FROM "authentication_rate_limit_buckets"
            WHERE "environment" = ${this.environment}
              AND "scope_hash" = ${this.scopeHash}
              AND "expires_at" <= CURRENT_TIMESTAMP
          `)
        : await this.database.$executeRaw(Prisma.sql`
            DELETE FROM "authentication_rate_limit_buckets"
            WHERE "expires_at" <= CURRENT_TIMESTAMP
          `);
    } catch (cause) {
      logger.error(
        {
          errorType:
            cause instanceof Error ? cause.name : "UnknownRateLimitError",
        },
        "Authentication rate-limit cleanup failed",
      );
      throw new AuthenticationServiceUnavailableError(
        "Authentication rate-limit cleanup is unavailable",
        { cause },
      );
    }
  }
}
