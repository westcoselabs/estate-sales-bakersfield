import { describe, expect, it } from "vitest";

import { CryptoOpaqueTokenProvider } from "@/modules/auth/infrastructure/crypto-token-provider";

describe("CryptoOpaqueTokenProvider", () => {
  it("creates independent tokens with at least 256 bits of entropy", () => {
    const provider = new CryptoOpaqueTokenProvider();
    const first = provider.generate();
    const second = provider.generate();

    expect(first).not.toBe(second);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(Buffer.from(second, "base64url")).toHaveLength(32);
  });

  it("hashes deterministically without preserving the token", () => {
    const provider = new CryptoOpaqueTokenProvider();
    const token = provider.generate();
    const digest = provider.hash(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(provider.hash(token));
    expect(digest).not.toContain(token);
  });
});
