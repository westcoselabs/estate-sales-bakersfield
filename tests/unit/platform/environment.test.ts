import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/platform/config/env";

const base = {
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_URL: "http://127.0.0.1:3417",
  LOG_LEVEL: "silent",
};

describe("server environment validation", () => {
  it("allows credential-free local and test configuration", () => {
    expect(parseServerEnvironment(base)).toMatchObject(base);
  });

  it("requires Neon and durable secrets for deployed environments", () => {
    expect(() =>
      parseServerEnvironment({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
      }),
    ).toThrow();
    expect(
      parseServerEnvironment({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
        APP_URL: "https://production.example.test",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        DATABASE_RESOURCE_ENV: "production",
        CRON_SECRET: "a".repeat(32),
      }),
    ).toMatchObject({ APP_ENV: "production" });
  });

  it("requires provider credential pairs and confines capture to local/test", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        APP_ENV: "preview",
        APP_URL: "https://preview.example.test",
        LOG_LEVEL: "info",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        CRON_SECRET: "x".repeat(32),
        RESEND_API_KEY: "test-key",
      }),
    ).toThrow();

    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        APP_ENV: "preview",
        APP_URL: "https://preview.example.test",
        LOG_LEVEL: "info",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        CRON_SECRET: "x".repeat(32),
        AUTH_EMAIL_CAPTURE_PATH: ".tmp/capture.jsonl",
      }),
    ).toThrow();
  });

  it("requires origin-only application URLs and HTTPS when deployed", () => {
    expect(() =>
      parseServerEnvironment({
        ...base,
        APP_URL: "http://127.0.0.1:3417/path?token=unsafe",
      }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
        APP_URL: "http://production.example.test",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        CRON_SECRET: "x".repeat(32),
      }),
    ).toThrow();
  });

  it("allows capture in local/test and rejects it when deployed", () => {
    expect(
      parseServerEnvironment({
        ...base,
        APP_ENV: "local",
        NODE_ENV: "development",
        AUTH_EMAIL_CAPTURE_PATH: ".tmp/local-emails.jsonl",
      }),
    ).toMatchObject({ APP_ENV: "local" });
  });

  it("allows exactly four application environments and requires provider scope markers", () => {
    expect(() =>
      parseServerEnvironment({ ...base, APP_ENV: "staging" }),
    ).toThrow();
    const preview = {
      ...base,
      NODE_ENV: "production",
      APP_ENV: "preview",
      APP_URL: "https://preview.example.test",
      DATABASE_URL: "postgresql://example.test/database",
      DIRECT_URL: "postgresql://example.test/database",
      DATABASE_RESOURCE_ENV: "preview",
      CRON_SECRET: "x".repeat(32),
      RESEND_API_KEY: "preview-key",
      RESEND_FROM: "Preview <preview@example.test>",
    };
    expect(() => parseServerEnvironment(preview)).toThrow(
      /RESEND_RESOURCE_ENV/,
    );
    expect(() =>
      parseServerEnvironment({
        ...preview,
        DATABASE_RESOURCE_ENV: "preview",
        RESEND_RESOURCE_ENV: "production",
      }),
    ).toThrow(/RESEND_RESOURCE_ENV/);
    expect(
      parseServerEnvironment({
        ...preview,
        DATABASE_RESOURCE_ENV: "preview",
        RESEND_RESOURCE_ENV: "preview",
      }).RESEND_RESOURCE_ENV,
    ).toBe("preview");

    expect(() =>
      parseServerEnvironment({
        ...preview,
        DATABASE_RESOURCE_ENV: "production",
        RESEND_RESOURCE_ENV: "preview",
      }),
    ).toThrow(/DATABASE_RESOURCE_ENV/);
  });

  it("rejects test-media seams outside APP_ENV=test", () => {
    expect(() =>
      parseServerEnvironment({
        ...base,
        APP_ENV: "local",
        NODE_ENV: "development",
        TEST_MEDIA_ROOT: ".tmp/test-media",
        TEST_MEDIA_SIGNING_SECRET: "x".repeat(32),
      }),
    ).toThrow(/Test media configuration/);
  });

  it("confines per-run rate-limit isolation to APP_ENV=test", () => {
    expect(
      parseServerEnvironment({
        ...base,
        TEST_RUN_ID: "testrun-rate-limits-1234",
      }).TEST_RUN_ID,
    ).toBe("testrun-rate-limits-1234");
    expect(() =>
      parseServerEnvironment({
        ...base,
        APP_ENV: "local",
        NODE_ENV: "development",
        TEST_RUN_ID: "testrun-rate-limits-1234",
      }),
    ).toThrow(/TEST_RUN_ID/);
  });

  it("requires complete Preview-only Stripe test configuration", () => {
    const preview = {
      ...base,
      NODE_ENV: "production",
      APP_ENV: "preview",
      APP_URL: "https://preview.example.test",
      DATABASE_URL: "postgresql://example.test/database",
      DIRECT_URL: "postgresql://example.test/database",
      DATABASE_RESOURCE_ENV: "preview",
      CRON_SECRET: "x".repeat(32),
      STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}`,
      STRIPE_WEBHOOK_SECRET: `whsec_${"y".repeat(24)}`,
      STRIPE_PRICE_ID: "price_preview_fixture",
      STRIPE_EXPECTED_AMOUNT: "1234",
      STRIPE_EXPECTED_CURRENCY: "USD",
      STRIPE_MODE: "test",
      STRIPE_RESOURCE_ENV: "preview",
    };
    expect(parseServerEnvironment(preview)).toMatchObject({
      APP_ENV: "preview",
      STRIPE_EXPECTED_AMOUNT: 1234,
      STRIPE_EXPECTED_CURRENCY: "usd",
      STRIPE_MODE: "test",
    });
    expect(() =>
      parseServerEnvironment({ ...preview, STRIPE_PRICE_ID: undefined }),
    ).toThrow(/STRIPE_PRICE_ID/);
    expect(() =>
      parseServerEnvironment({ ...preview, STRIPE_MODE: "live" }),
    ).toThrow(/Stripe test mode/);
    expect(() =>
      parseServerEnvironment({
        ...preview,
        STRIPE_RESOURCE_ENV: "production",
      }),
    ).toThrow(/STRIPE_RESOURCE_ENV/);
  });

  it("keeps Test credential-free and on its deterministic Stripe adapter", () => {
    expect(() =>
      parseServerEnvironment({
        ...base,
        STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}`,
        STRIPE_WEBHOOK_SECRET: `whsec_${"y".repeat(24)}`,
        STRIPE_PRICE_ID: "price_test_fixture",
        STRIPE_EXPECTED_AMOUNT: "1234",
        STRIPE_EXPECTED_CURRENCY: "usd",
        STRIPE_MODE: "test",
        STRIPE_RESOURCE_ENV: "test",
      }),
    ).toThrow(/cannot use real Stripe credentials/);
  });
});
