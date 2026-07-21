import "server-only";

import type { RateLimiter } from "../application/ports";

interface Counter {
  count: number;
  expiresAt: number;
}

declare global {
  var __estateSalesTestRateLimits: Map<string, Counter> | undefined;
}

export class TestMemoryRateLimiter implements RateLimiter {
  private readonly counters: Map<string, Counter>;

  constructor() {
    if (process.env.APP_ENV !== "test") {
      throw new Error("The memory rate limiter is test-only");
    }
    globalThis.__estateSalesTestRateLimits ??= new Map();
    this.counters = globalThis.__estateSalesTestRateLimits;
  }

  consume(
    input: Parameters<RateLimiter["consume"]>[0],
  ): Promise<Awaited<ReturnType<RateLimiter["consume"]>>> {
    const now = Date.now();
    const key = `${input.namespace}:${input.identifier}`;
    const current = this.counters.get(key);
    const counter =
      current && current.expiresAt > now
        ? current
        : {
            count: 0,
            expiresAt: now + input.windowSeconds * 1000,
          };
    counter.count += 1;
    this.counters.set(key, counter);
    return Promise.resolve({
      allowed: counter.count <= input.limit,
      remaining: Math.max(input.limit - counter.count, 0),
      retryAfterSeconds: Math.max(
        Math.ceil((counter.expiresAt - now) / 1000),
        1,
      ),
    });
  }
}
