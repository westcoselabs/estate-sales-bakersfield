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
        DATABASE_DRIVER: "neon",
        DATABASE_URL: "postgresql://example.test/database",
        DIRECT_URL: "postgresql://example.test/database",
        CRON_SECRET: "a".repeat(32),
      }),
    ).toMatchObject({ APP_ENV: "staging", DATABASE_DRIVER: "neon" });
  });
});
