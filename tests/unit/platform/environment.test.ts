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

  it("allows only Development database resources in local and test modes", () => {
    const development = {
      ...base,
      APP_ENV: "local",
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://example.test/database",
      DIRECT_URL: "postgresql://example.test/database",
      DATABASE_RESOURCE_ENV: "development",
    };
    expect(parseServerEnvironment(development)).toMatchObject({
      APP_ENV: "local",
      DATABASE_RESOURCE_ENV: "development",
    });
    expect(() =>
      parseServerEnvironment({
        ...development,
        DATABASE_RESOURCE_ENV: "production",
      }),
    ).toThrow(/DATABASE_RESOURCE_ENV must be development/);
  });

  it("requires database-backed tests to use an isolated Development schema", () => {
    const schema = "codex_test_1785888000000_0123456789ab";
    const schemaQuery = `schema=${schema}&options=${encodeURIComponent(`-c search_path=${schema},public`)}`;
    const testDatabase = {
      ...base,
      DATABASE_URL: `postgresql://example.test/database?${schemaQuery}`,
      DIRECT_URL: `postgresql://example.test/database?${schemaQuery}`,
      DATABASE_RESOURCE_ENV: "development",
      TEST_SCHEMA_NAME: schema,
      TEST_RUN_ID: "testrun-environment-1234",
    };
    expect(parseServerEnvironment(testDatabase)).toMatchObject({
      APP_ENV: "test",
      DATABASE_RESOURCE_ENV: "development",
    });
    expect(() =>
      parseServerEnvironment({
        ...testDatabase,
        DATABASE_URL: "postgresql://example.test/database",
      }),
    ).toThrow(/isolated Development test schema/);
    expect(() =>
      parseServerEnvironment({
        ...testDatabase,
        DIRECT_URL: testDatabase.DIRECT_URL.replace(
          schema,
          "codex_test_1785888000001_abcdefabcdef",
        ),
      }),
    ).toThrow(/TEST_SCHEMA_NAME/);
    expect(() =>
      parseServerEnvironment({
        ...testDatabase,
        TEST_SCHEMA_NAME: undefined,
      }),
    ).toThrow(/TEST_SCHEMA_NAME/);
    expect(() =>
      parseServerEnvironment({
        ...testDatabase,
        DIRECT_URL: testDatabase.DIRECT_URL.replace(
          encodeURIComponent(`-c search_path=${schema},public`),
          encodeURIComponent("-c search_path=public"),
        ),
      }),
    ).toThrow(/schema search path/);
    expect(() =>
      parseServerEnvironment({
        ...testDatabase,
        DATABASE_URL: undefined,
      }),
    ).toThrow(/DATABASE_URL/);
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
        VERCEL_ENV: "production",
        APP_URL: "https://production.example.test",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        DATABASE_RESOURCE_ENV: "production",
        CRON_SECRET: "a".repeat(32),
        GEOAPIFY_API_KEY: "g".repeat(32),
        NEXT_PUBLIC_MAP_STYLE_URL:
          "https://tiles.openfreemap.org/styles/liberty",
      }),
    ).toMatchObject({ APP_ENV: "production" });
    expect(() =>
      parseServerEnvironment({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
        APP_URL: "https://production.example.test",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        DATABASE_RESOURCE_ENV: "production",
        CRON_SECRET: "a".repeat(32),
        GEOAPIFY_API_KEY: "g".repeat(32),
        NEXT_PUBLIC_MAP_STYLE_URL:
          "https://tiles.openfreemap.org/styles/liberty",
      }),
    ).toThrow(/Vercel Production runtime/);
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
      GEOAPIFY_API_KEY: "g".repeat(32),
      NEXT_PUBLIC_MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/liberty",
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
      GEOAPIFY_API_KEY: "g".repeat(32),
      NEXT_PUBLIC_MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/liberty",
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

  it("allows only Stripe test credentials in explicitly gated Production beta", () => {
    const productionBeta = {
      ...base,
      NODE_ENV: "production",
      APP_ENV: "production",
      VERCEL_ENV: "production",
      PRODUCTION_BETA_MODE: "true",
      APP_URL: "https://production.example.test",
      DATABASE_URL: "postgresql://example.test/database",
      DIRECT_URL: "postgresql://example.test/database",
      DATABASE_RESOURCE_ENV: "production",
      CRON_SECRET: "x".repeat(32),
      STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}`,
      STRIPE_WEBHOOK_SECRET: `whsec_${"y".repeat(24)}`,
      STRIPE_PRICE_ID: "price_production_beta",
      STRIPE_EXPECTED_AMOUNT: "2000",
      STRIPE_EXPECTED_CURRENCY: "USD",
      STRIPE_MODE: "test",
      STRIPE_RESOURCE_ENV: "production",
      GEOAPIFY_API_KEY: "geoapify-production-beta-key",
      NEXT_PUBLIC_MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/liberty",
    };

    expect(parseServerEnvironment(productionBeta)).toMatchObject({
      APP_ENV: "production",
      PRODUCTION_BETA_MODE: true,
      STRIPE_MODE: "test",
    });
    expect(() =>
      parseServerEnvironment({
        ...productionBeta,
        STRIPE_MODE: "live",
        STRIPE_SECRET_KEY: `sk_live_${"x".repeat(24)}`,
      }),
    ).toThrow(/Production beta Stripe configuration/);
    expect(() =>
      parseServerEnvironment({
        ...productionBeta,
        STRIPE_SECRET_KEY: `sk_live_${"x".repeat(24)}`,
      }),
    ).toThrow(/Production beta Stripe configuration/);
  });

  it("retains live-only Stripe protection for normal Production", () => {
    const production = {
      ...base,
      NODE_ENV: "production",
      APP_ENV: "production",
      VERCEL_ENV: "production",
      APP_URL: "https://production.example.test",
      DATABASE_URL: "postgresql://example.test/database",
      DIRECT_URL: "postgresql://example.test/database",
      DATABASE_RESOURCE_ENV: "production",
      CRON_SECRET: "x".repeat(32),
      STRIPE_SECRET_KEY: `sk_live_${"x".repeat(24)}`,
      STRIPE_WEBHOOK_SECRET: `whsec_${"y".repeat(24)}`,
      STRIPE_PRICE_ID: "price_production_live",
      STRIPE_EXPECTED_AMOUNT: "2000",
      STRIPE_EXPECTED_CURRENCY: "usd",
      STRIPE_MODE: "live",
      STRIPE_RESOURCE_ENV: "production",
      GEOAPIFY_API_KEY: "geoapify-production-live-key",
      NEXT_PUBLIC_MAP_STYLE_URL: "https://tiles.openfreemap.org/styles/liberty",
    };

    expect(parseServerEnvironment(production)).toMatchObject({
      APP_ENV: "production",
      PRODUCTION_BETA_MODE: false,
      STRIPE_MODE: "live",
    });
    expect(() =>
      parseServerEnvironment({
        ...production,
        STRIPE_MODE: "test",
        STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}`,
      }),
    ).toThrow(/explicitly live/);
    expect(() =>
      parseServerEnvironment({
        ...production,
        STRIPE_SECRET_KEY: `sk_test_${"x".repeat(24)}`,
      }),
    ).toThrow(/explicitly live/);
  });

  it("rejects the Production beta flag outside Production", () => {
    expect(() =>
      parseServerEnvironment({
        ...base,
        PRODUCTION_BETA_MODE: "true",
      }),
    ).toThrow(/only in production/);
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
