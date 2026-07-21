import "server-only";

import { Redis } from "@upstash/redis";

import { logger } from "@/platform/observability/logger";

import type { RateLimitDecision, RateLimiter } from "../application/ports";
import { AuthenticationServiceUnavailableError } from "../domain/errors";

const FIXED_WINDOW_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`;

interface RedisRateLimitClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export class UpstashRateLimiter implements RateLimiter {
  private readonly client: RedisRateLimitClient;

  constructor(input: {
    readonly environment: string;
    readonly url: string;
    readonly token: string;
    readonly client?: RedisRateLimitClient;
  }) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(input.environment)) {
      throw new Error("The rate-limit environment namespace is invalid");
    }
    this.environment = input.environment;
    this.client =
      input.client ??
      new Redis({
        url: input.url,
        token: input.token,
      });
  }

  private readonly environment: string;

  async consume(
    input: Parameters<RateLimiter["consume"]>[0],
  ): Promise<RateLimitDecision> {
    const key =
      `auth:v1:${this.environment}:` + `${input.namespace}:${input.identifier}`;
    try {
      const result = await this.client.eval(
        FIXED_WINDOW_SCRIPT,
        [key],
        [String(input.windowSeconds)],
      );
      if (
        !Array.isArray(result) ||
        typeof result[0] !== "number" ||
        typeof result[1] !== "number"
      ) {
        throw new Error("The rate-limit provider returned invalid data");
      }
      const [count, ttl] = result;
      return {
        allowed: count <= input.limit,
        remaining: Math.max(input.limit - count, 0),
        retryAfterSeconds: Math.max(ttl, 1),
      };
    } catch (cause) {
      logger.error(
        {
          errorType:
            cause instanceof Error ? cause.name : "UnknownRateLimitError",
          namespace: input.namespace,
        },
        "Authentication rate-limit provider failed",
      );
      throw new AuthenticationServiceUnavailableError(
        "Authentication abuse controls are unavailable",
        { cause },
      );
    }
  }
}
