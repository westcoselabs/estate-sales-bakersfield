import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("sensitive page headers", () => {
  it("traces only the native Sharp runtime assets for photo finalization", () => {
    const routePattern = "/api/events/*/photos/*/finalize";
    const tracingIncludes = nextConfig.outputFileTracingIncludes;

    expect(Object.keys(tracingIncludes ?? {})).toEqual([routePattern]);
    expect(tracingIncludes?.[routePattern]).toEqual([
      "./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*",
    ]);
    expect(tracingIncludes?.["/*"]).toBeUndefined();
    expect(tracingIncludes?.["/**"]).toBeUndefined();
    expect(tracingIncludes?.[routePattern]).not.toContain(
      "./node_modules/**/*",
    );
    expect(tracingIncludes?.[routePattern]).not.toContain("./**/*");
  });

  it("permits every resource used by the current Liberty style and rejects unrelated map hosts", async () => {
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
      "https://tiles.openfreemap.org",
    ]);
    expect(sources).not.toContain("*");
    expect(sources).not.toContain("https:");
    expect(sources).not.toContain("https://attacker.example");

    expect(csp).toContain(
      "img-src 'self' blob: data: https://tiles.openfreemap.org",
    );
    // MapLibre retrieves glyph PBFs with fetch, so the tiles host belongs in
    // connect-src rather than broadening font-src for an unused host.
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).not.toContain("https://assets.openfreemap.com");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toContain("api.geoapify.com");
    expect(csp).not.toContain("api.mapbox.com");
    expect(csp).not.toContain("maps.googleapis.com");
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
