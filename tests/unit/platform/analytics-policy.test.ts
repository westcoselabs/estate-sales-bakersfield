import { describe, expect, it } from "vitest";
import {
  analyticsPagePath,
  validMeasurementId,
} from "@/platform/seo/analytics-policy";

describe("public analytics policy", () => {
  it("drops query strings and fragments from public page locations", () => {
    expect(analyticsPagePath("/search?q=private-address#token")).toBe(
      "/search",
    );
    expect(
      analyticsPagePath(
        "/estate-sales/weekend-sale-abc123def456?email=private",
      ),
    ).toBe("/estate-sales/weekend-sale-abc123def456");
  });
  it.each([
    "/dashboard",
    "/dashboard/events/private-id/payment/success?session_id=secret",
    "/admin/users/123",
    "/login",
    "/reset-password?token=secret",
    "/verify-email?token=secret",
    "/account/security",
    "/api/health",
    "/unknown",
    "//evil.test",
  ])("excludes nonpublic route %s", (path) => {
    expect(analyticsPagePath(path)).toBeNull();
  });
  it("rejects script injection and non-GA4 measurement IDs", () => {
    expect(validMeasurementId("G-4LYJ726JEQ")).toBe(true);
    for (const value of [
      "",
      'G-test" onload=alert(1)',
      "UA-123",
      "G-ABC?secret=1",
    ])
      expect(validMeasurementId(value)).toBe(false);
  });
});
