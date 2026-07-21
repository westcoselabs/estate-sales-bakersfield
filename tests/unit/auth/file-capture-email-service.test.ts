import { afterEach, describe, expect, it } from "vitest";

import { FileCaptureEmailService } from "@/modules/auth/infrastructure/file-capture-email-service";
import { authenticationEmailAdapterKind } from "@/modules/auth/infrastructure/configured-auth";

const originalAppEnvironment = process.env.APP_ENV;

afterEach(() => {
  if (originalAppEnvironment === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnvironment;
});

describe("FileCaptureEmailService safety", () => {
  it("allows only ignored local/test capture paths", () => {
    process.env.APP_ENV = "test";
    expect(
      () => new FileCaptureEmailService(".tmp/auth-emails.jsonl"),
    ).not.toThrow();
    expect(() => new FileCaptureEmailService("auth-emails.jsonl")).toThrow(
      /inside \.tmp/i,
    );
  });

  it("refuses deployed environments", () => {
    process.env.APP_ENV = "preview";
    expect(() => new FileCaptureEmailService(".tmp/auth-emails.jsonl")).toThrow(
      /local\/test-only/i,
    );
  });

  it("never selects Resend in local or test environments", () => {
    expect(
      authenticationEmailAdapterKind({
        APP_ENV: "test",
        RESEND_API_KEY: "inherited-real-key",
        RESEND_FROM: "accounts@example.test",
      }),
    ).toBeNull();
    expect(
      authenticationEmailAdapterKind({
        APP_ENV: "local",
        AUTH_EMAIL_CAPTURE_PATH: ".tmp/local-emails.jsonl",
        RESEND_API_KEY: "inherited-real-key",
        RESEND_FROM: "accounts@example.test",
      }),
    ).toBe("FILE_CAPTURE");
    expect(
      authenticationEmailAdapterKind({
        APP_ENV: "preview",
        RESEND_API_KEY: "preview-key",
        RESEND_FROM: "accounts@example.test",
      }),
    ).toBe("RESEND");
  });
});
