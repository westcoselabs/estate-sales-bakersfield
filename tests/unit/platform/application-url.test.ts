import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getServerApplicationUrl,
  getTrustedApplicationUrls,
} from "@/platform/config/application-url";
import { resetEnvironmentCacheForTests } from "@/platform/config/env";

function configurePreviewEnvironment() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ENV", "preview");
  vi.stubEnv("APP_URL", "https://canonical.example.test");
  vi.stubEnv("LOG_LEVEL", "silent");
  vi.stubEnv("DATABASE_URL", "postgresql://example.test/database");
  vi.stubEnv("DIRECT_URL", "postgresql://example.test/database");
  vi.stubEnv("DATABASE_RESOURCE_ENV", "preview");
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  vi.stubEnv("AUTH_EMAIL_CAPTURE_PATH", "");
  vi.stubEnv("TEST_MEDIA_ROOT", "");
  vi.stubEnv("TEST_MEDIA_SECRET", "");
  resetEnvironmentCacheForTests();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvironmentCacheForTests();
});

describe("server application URL", () => {
  it("uses only the active Vercel Preview host", () => {
    configurePreviewEnvironment();
    expect(
      getServerApplicationUrl({
        NODE_ENV: "production",
        VERCEL_URL: "estate-sales-preview-123.vercel.app",
      }),
    ).toEqual(new URL("https://estate-sales-preview-123.vercel.app"));
  });

  it("trusts the active Preview deployment and branch alias origins", () => {
    configurePreviewEnvironment();
    expect(
      getTrustedApplicationUrls({
        NODE_ENV: "production",
        VERCEL_URL: "estate-sales-preview-123.vercel.app",
        VERCEL_BRANCH_URL: "estate-sales-git-branch-team.vercel.app",
      }).map((url) => url.origin),
    ).toEqual([
      "https://estate-sales-preview-123.vercel.app",
      "https://estate-sales-git-branch-team.vercel.app",
    ]);
  });

  it("fails closed when Preview has an invalid branch alias host", () => {
    configurePreviewEnvironment();
    expect(() =>
      getTrustedApplicationUrls({
        NODE_ENV: "production",
        VERCEL_URL: "estate-sales-preview-123.vercel.app",
        VERCEL_BRANCH_URL: "attacker.example.test",
      }),
    ).toThrow(/VERCEL_BRANCH_URL/);
  });

  it("fails closed when Preview has no valid Vercel host", () => {
    configurePreviewEnvironment();
    expect(() => getServerApplicationUrl({ NODE_ENV: "production" })).toThrow(
      /VERCEL_URL/,
    );
    expect(() =>
      getServerApplicationUrl({
        NODE_ENV: "production",
        VERCEL_URL: "attacker.example.test",
      }),
    ).toThrow(/VERCEL_URL/);
  });
});
