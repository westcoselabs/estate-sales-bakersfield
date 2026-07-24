import { describe, expect, it } from "vitest";

import { sanitizeSentryEvent } from "@/platform/observability/sanitize";
import {
  assertTrustedOrigin,
  TrustedOriginError,
} from "@/platform/security/trusted-origin";

describe("security and observability boundaries", () => {
  it("accepts only the configured application origin", () => {
    const appUrl = new URL("https://example.test");
    expect(() =>
      assertTrustedOrigin(
        new Request("https://example.test/action", {
          headers: { origin: "https://example.test" },
        }),
        appUrl,
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedOrigin(
        new Request("https://example.test/action", {
          headers: { origin: "https://attacker.test" },
        }),
        appUrl,
      ),
    ).toThrow(TrustedOriginError);
  });

  it("accepts an explicit list of trusted application origins", () => {
    expect(() =>
      assertTrustedOrigin(
        new Request("https://deployment.example.test/action", {
          headers: { origin: "https://branch.example.test" },
        }),
        [
          new URL("https://deployment.example.test"),
          new URL("https://branch.example.test"),
        ],
      ),
    ).not.toThrow();
    expect(() =>
      assertTrustedOrigin(
        new Request("https://deployment.example.test/action", {
          headers: { origin: "https://attacker.example.test" },
        }),
        [
          new URL("https://deployment.example.test"),
          new URL("https://branch.example.test"),
        ],
      ),
    ).toThrow(TrustedOriginError);
  });

  it("removes credentials and direct user identifiers from error events", () => {
    const opaqueToken = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    const sanitized = sanitizeSentryEvent({
      request: {
        headers: { authorization: "Bearer raw", cookie: "session=raw" },
        url: `https://example.test/reset-password?token=${opaqueToken}`,
      },
      password: "not-for-logs",
      nested: {
        resetToken: "raw-token",
        stripeSignature: "raw-signature",
        checkoutUrl: "https://checkout.example.test/raw-session",
        rawBody: "raw-webhook-body",
        safe: "value",
        href: `/verify-email?token=${opaqueToken}`,
        opaqueCredential: opaqueToken,
        geoapifyApiKey: "raw-geoapify-key",
        addressLine1: "123 Private Street",
        coordinates: [-119.1, 35.3],
      },
      user: {
        id: "user-1",
        email: "person@example.test",
        ip_address: "127.0.0.1",
      },
    });

    expect(sanitized).toEqual({
      request: {
        headers: { authorization: "[REDACTED]", cookie: "[REDACTED]" },
        url: "https://example.test/reset-password?token=[REDACTED]",
      },
      password: "[REDACTED]",
      nested: {
        resetToken: "[REDACTED]",
        stripeSignature: "[REDACTED]",
        checkoutUrl: "[REDACTED]",
        rawBody: "[REDACTED]",
        safe: "value",
        href: "/verify-email?token=[REDACTED]",
        opaqueCredential: "[REDACTED]",
        geoapifyApiKey: "[REDACTED]",
        addressLine1: "[REDACTED]",
        coordinates: "[REDACTED]",
      },
      user: { id: "user-1" },
    });
  });
});
