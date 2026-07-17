import { describe, expect, it, vi } from "vitest";

import type {
  OpaqueTokenProvider,
  SingleUseTokenRepository,
} from "@/modules/auth/application/ports";
import { SingleUseTokenService } from "@/modules/auth/application/single-use-token-service";

describe("SingleUseTokenService", () => {
  it("persists a hash and returns the raw token only to the caller", async () => {
    const repository = {
      replaceActive: vi.fn(async () => undefined),
      consume: vi.fn(async () => "user-1"),
    } satisfies SingleUseTokenRepository;
    const tokens = {
      generate: vi.fn(() => "raw-one-time-token"),
      hash: vi.fn((token: string) => `digest:${token}`),
    } satisfies OpaqueTokenProvider;
    const now = new Date("2026-07-16T12:00:00.000Z");
    const service = new SingleUseTokenService(repository, tokens, () => now);

    await expect(service.issue("EMAIL_VERIFICATION", "user-1")).resolves.toBe(
      "raw-one-time-token",
    );
    await expect(
      service.consume("EMAIL_VERIFICATION", "presented"),
    ).resolves.toBe("user-1");

    expect(repository.replaceActive).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "digest:raw-one-time-token" }),
    );
    expect(repository.consume).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: "digest:presented" }),
    );
  });
});
