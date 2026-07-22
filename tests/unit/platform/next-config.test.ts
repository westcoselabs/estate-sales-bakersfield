import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("sensitive page headers", () => {
  it("permits only the required Blob and Sentry connection origins", async () => {
    const headers = await nextConfig.headers?.();
    const securityHeaders = headers?.find((entry) => entry.source === "/(.*)");
    const csp = securityHeaders?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;
    const connectDirective = csp
      ?.split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("connect-src "));
    const sources = connectDirective?.split(/\s+/).slice(1);

    expect(sources).toEqual([
      "'self'",
      "https://vercel.com",
      "https://*.ingest.sentry.io",
    ]);
    expect(sources).not.toContain("*");
    expect(sources).not.toContain("https:");
    expect(sources).not.toContain("https://attacker.example");
  });

  it("keeps the remaining browser security headers intact", async () => {
    const headers = await nextConfig.headers?.();
    const securityHeaders = headers?.find((entry) => entry.source === "/(.*)");
    const values = Object.fromEntries(
      securityHeaders?.headers.map((header) => [header.key, header.value]) ??
        [],
    );

    expect(values["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(values["X-Content-Type-Options"]).toBe("nosniff");
    expect(values["X-Frame-Options"]).toBe("DENY");
    expect(values["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(self)",
    );
  });

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
