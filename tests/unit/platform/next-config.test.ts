import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("sensitive page headers", () => {
  it("overrides token pages with a no-referrer policy", async () => {
    const headers = await nextConfig.headers?.();
    const resetPolicy = headers?.find(
      (entry) =>
        entry.source === "/reset-password" &&
        entry.headers.some(
          (header) =>
            header.key === "Referrer-Policy" && header.value === "no-referrer",
        ),
    );
    const verificationPolicy = headers?.find(
      (entry) =>
        entry.source === "/verify-email" &&
        entry.headers.some(
          (header) =>
            header.key === "Referrer-Policy" && header.value === "no-referrer",
        ),
    );

    expect(resetPolicy).toBeDefined();
    expect(verificationPolicy).toBeDefined();
  });
});
