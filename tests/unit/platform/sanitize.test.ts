import { describe, expect, it } from "vitest";
import { sanitizeSentryEvent } from "@/platform/observability/sanitize";

describe("MFA telemetry sanitization", () => {
  it("redacts authenticator and recovery material through nested error context", () => {
    const result = sanitizeSentryEvent({
      extra: {
        code: "123456",
        secret: "raw-authenticator-secret",
        recoveryCodes: ["raw-recovery-code"],
        context: {
          pendingEncryptedSecret: "raw-pending-ciphertext",
          totp: "654321",
          safe: "visible",
        },
      },
    });
    expect(result).toEqual({
      extra: {
        code: "[REDACTED]",
        secret: "[REDACTED]",
        recoveryCodes: "[REDACTED]",
        context: {
          pendingEncryptedSecret: "[REDACTED]",
          totp: "[REDACTED]",
          safe: "visible",
        },
      },
    });
  });
});
