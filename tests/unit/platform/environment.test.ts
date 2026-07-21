import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/platform/config/env";

const base = {
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_URL: "http://127.0.0.1:3417",
  LOG_LEVEL: "silent",
  DATABASE_DRIVER: "pg",
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
        APP_ENV: "staging",
      }),
    ).toThrow();
    expect(
      parseServerEnvironment({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "staging",
        APP_URL: "https://staging.example.test",
        DATABASE_DRIVER: "neon",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        CRON_SECRET: "a".repeat(32),
      }),
    ).toMatchObject({ APP_ENV: "staging", DATABASE_DRIVER: "neon" });
  });

  it("requires provider credential pairs and confines capture to local/test", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        APP_ENV: "preview",
        APP_URL: "https://preview.example.test",
        LOG_LEVEL: "info",
        DATABASE_DRIVER: "neon",
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
        DATABASE_DRIVER: "neon",
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
        APP_ENV: "staging",
        APP_URL: "http://staging.example.test",
        DATABASE_DRIVER: "neon",
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
});
