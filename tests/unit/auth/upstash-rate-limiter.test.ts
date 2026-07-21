import { describe, expect, it, vi } from "vitest";

import { AuthenticationServiceUnavailableError } from "@/modules/auth/domain/errors";
import { UpstashRateLimiter } from "@/modules/auth/infrastructure/upstash-rate-limiter";

describe("UpstashRateLimiter", () => {
  it("maps the atomic fixed-window result to application types", async () => {
    const client = {
      eval: vi.fn(async (...parameters: [string, string[], string[]]) => {
        void parameters;
        return [3, 45] as [number, number];
      }),
    };
    const limiter = new UpstashRateLimiter({
      environment: "preview",
      url: "https://example.test",
      token: "test-token",
      client,
    });

    await expect(
      limiter.consume({
        namespace: "login:subject",
        identifier: "a".repeat(64),
        limit: 5,
        windowSeconds: 60,
      }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 45,
    });
    expect(client.eval).toHaveBeenCalledTimes(1);
    expect(client.eval.mock.calls[0]?.[1]).toEqual([
      `auth:v1:preview:login:subject:${"a".repeat(64)}`,
    ]);
  });

  it("fails closed when the distributed provider is unavailable", async () => {
    const limiter = new UpstashRateLimiter({
      environment: "preview",
      url: "https://example.test",
      token: "test-token",
      client: {
        eval: vi.fn(async () => {
          throw new Error("provider unavailable");
        }),
      },
    });

    await expect(
      limiter.consume({
        namespace: "login:network",
        identifier: "b".repeat(64),
        limit: 5,
        windowSeconds: 60,
      }),
    ).rejects.toBeInstanceOf(AuthenticationServiceUnavailableError);
  });
});
