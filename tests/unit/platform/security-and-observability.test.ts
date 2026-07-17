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

  it("removes credentials and direct user identifiers from error events", () => {
    const sanitized = sanitizeSentryEvent({
      request: {
        headers: { authorization: "Bearer raw", cookie: "session=raw" },
      },
      password: "not-for-logs",
      nested: { resetToken: "raw-token", safe: "value" },
      user: {
        id: "user-1",
        email: "person@example.test",
        ip_address: "127.0.0.1",
      },
    });

    expect(sanitized).toEqual({
      request: {
        headers: { authorization: "[REDACTED]", cookie: "[REDACTED]" },
      },
      password: "[REDACTED]",
      nested: { resetToken: "[REDACTED]", safe: "value" },
      user: { id: "user-1" },
    });
  });
});
