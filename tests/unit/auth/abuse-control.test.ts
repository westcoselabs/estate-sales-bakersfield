import { describe, expect, it, vi } from "vitest";

import { AuthenticationAbuseControl } from "@/modules/auth/application/abuse-control";
import type {
  PrivacyFingerprint,
  RateLimiter,
} from "@/modules/auth/application/ports";
import type { RateLimitExceededError } from "@/modules/auth/domain/errors";

describe("AuthenticationAbuseControl", () => {
  it("uses privacy-safe network and subject identifiers", async () => {
    const limiter = {
      consume: vi.fn(async () => ({
        allowed: true,
        remaining: 2,
        retryAfterSeconds: 60,
      })),
    } satisfies RateLimiter;
    const fingerprints = {
      create: vi.fn((value: string) => `fingerprint:${value.length}`),
    } satisfies PrivacyFingerprint;
    const control = new AuthenticationAbuseControl(limiter, fingerprints);

    await control.assertAllowed("LOGIN", "192.0.2.10", "person@example.test");

    expect(limiter.consume).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(limiter.consume.mock.calls)).not.toContain(
      "person@example.test",
    );
    expect(JSON.stringify(limiter.consume.mock.calls)).not.toContain(
      "192.0.2.10",
    );
  });

  it("returns the longest retry period when any policy denies", async () => {
    const limiter = {
      consume: vi
        .fn<RateLimiter["consume"]>()
        .mockResolvedValueOnce({
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 30,
        })
        .mockResolvedValueOnce({
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 90,
        }),
    };
    const control = new AuthenticationAbuseControl(limiter, {
      create: (value) => `safe:${value.length}`,
    });

    await expect(
      control.assertAllowed("REGISTER", "network", "subject"),
    ).rejects.toMatchObject({
      retryAfterSeconds: 90,
    } satisfies Partial<RateLimitExceededError>);
  });
});
