import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_DATABASE_CONFIRMATION,
  isolateDevelopmentDatabase,
  requireIsolatedTestDatabase,
  requireSafeDevelopmentDatabase,
  schemaNameForTestRun,
  TEST_SCHEMA_PATTERN,
} from "../../../scripts/test-database-safety";
import { testDatabaseEnvironment } from "../../../scripts/test-database-run";

const safe = {
  NODE_ENV: "test",
  APP_ENV: "test",
  DATABASE_RESOURCE_ENV: "development",
  DEVELOPMENT_NEON_ENDPOINT_ID: "ep-development-123456",
  DEVELOPMENT_DATABASE_CONFIRMATION,
  DATABASE_URL:
    "postgresql://development_user:secret@ep-development-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
  DIRECT_URL:
    "postgresql://development_user:secret@ep-development-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
} satisfies NodeJS.ProcessEnv;

describe("Development Neon test-schema safety guard", () => {
  it("accepts only an explicitly confirmed Development endpoint", () => {
    expect(requireSafeDevelopmentDatabase(safe).endpointId).toBe(
      "ep-development-123456",
    );
    expect(() =>
      requireSafeDevelopmentDatabase({
        ...safe,
        APP_ENV: "production",
      }),
    ).toThrow(/APP_ENV=local or APP_ENV=test/);
    expect(() =>
      requireSafeDevelopmentDatabase({
        ...safe,
        DATABASE_RESOURCE_ENV: "production",
      }),
    ).toThrow(/DATABASE_RESOURCE_ENV=development/);
    expect(() =>
      requireSafeDevelopmentDatabase({
        ...safe,
        DEVELOPMENT_DATABASE_CONFIRMATION: undefined,
      }),
    ).toThrow(/does not authorize/);
  });

  it("rejects endpoint and known Production identity collisions", () => {
    expect(() =>
      requireSafeDevelopmentDatabase({
        ...safe,
        DATABASE_URL: safe.DATABASE_URL?.replace(
          "ep-development-123456-pooler",
          "ep-other-development-123456-pooler",
        ),
      }),
    ).toThrow(/does not match/);
    expect(() =>
      requireSafeDevelopmentDatabase({
        ...safe,
        PRODUCTION_NEON_ENDPOINT_ID: "ep-development-123456",
      }),
    ).toThrow(/must differ/);
    expect(() =>
      requireSafeDevelopmentDatabase({
        ...safe,
        PRODUCTION_DIRECT_URL: safe.DIRECT_URL,
      }),
    ).toThrow(/known non-Development database/);
  });

  it("rejects a preselected non-public schema in the base URLs", () => {
    expect(() =>
      requireSafeDevelopmentDatabase({
        ...safe,
        DATABASE_URL: `${safe.DATABASE_URL}&schema=unsafe_shared_schema`,
      }),
    ).toThrow(/base URL/);
  });

  it("derives deterministic, bounded, isolated schema URLs", () => {
    const runId = "testrun-safety-1234";
    const base = requireSafeDevelopmentDatabase(safe);
    const isolated = isolateDevelopmentDatabase(base, runId);
    expect(isolated.schemaName).toMatch(TEST_SCHEMA_PATTERN);
    expect(new URL(isolated.pooledUrl).searchParams.get("schema")).toBe(
      isolated.schemaName,
    );
    expect(new URL(isolated.directUrl).searchParams.get("schema")).toBe(
      isolated.schemaName,
    );
    expect(new URL(isolated.directUrl).searchParams.get("options")).toBe(
      `-c search_path=${isolated.schemaName},public`,
    );
    expect(schemaNameForTestRun("testrun-parallel-a")).not.toBe(
      schemaNameForTestRun("testrun-parallel-a"),
    );
    expect(() => schemaNameForTestRun("production")).toThrow(/invalid/);
  });

  it("removes Production, Preview, Vercel, provider, and Sentry values from test children", () => {
    const isolated = isolateDevelopmentDatabase(
      requireSafeDevelopmentDatabase(safe),
      "testrun-safety-1234",
    );
    const child = testDatabaseEnvironment(isolated, "testrun-safety-1234", {
      NODE_ENV: "production",
      PATH: "retained-path",
      VERCEL_ENV: "production",
      VERCEL_OIDC_TOKEN: "credential",
      VERCEL_PROJECT_PRODUCTION_URL: "production.example.test",
      NEXT_PUBLIC_SENTRY_DSN: "https://public-secret@example.test/1",
      PREVIEW_DATABASE_URL: "preview-secret",
      PRODUCTION_DATABASE_URL: "production-secret",
      RESEND_API_KEY: "email-secret",
      BLOB_READ_WRITE_TOKEN: "blob-secret",
      SENTRY_DSN: "https://secret@example.test/1",
    });
    expect(child).toMatchObject({
      PATH: "retained-path",
      APP_ENV: "test",
      DATABASE_RESOURCE_ENV: "development",
      DATABASE_URL: isolated.directUrl,
      DIRECT_URL: isolated.directUrl,
      TEST_RUN_ID: "testrun-safety-1234",
      TEST_SCHEMA_NAME: isolated.schemaName,
    });
    expect(child.VERCEL_ENV).toBeUndefined();
    expect(child.VERCEL_OIDC_TOKEN).toBeUndefined();
    expect(child.VERCEL_PROJECT_PRODUCTION_URL).toBeUndefined();
    expect(child.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined();
    expect(child.NEXT_PUBLIC_APP_ENV).toBe("test");
    expect(child.PREVIEW_DATABASE_URL).toBeUndefined();
    expect(child.PRODUCTION_DATABASE_URL).toBeUndefined();
    expect(child.RESEND_API_KEY).toBeUndefined();
    expect(child.BLOB_READ_WRITE_TOKEN).toBeUndefined();
    expect(child.SENTRY_DSN).toBeUndefined();
  });

  it("accepts only a fully isolated child-process database environment", () => {
    const isolated = isolateDevelopmentDatabase(
      requireSafeDevelopmentDatabase(safe),
      "testrun-child-1234",
    );
    const child = testDatabaseEnvironment(isolated, "testrun-child-1234", safe);
    expect(requireIsolatedTestDatabase(child)).toMatchObject({
      schemaName: isolated.schemaName,
      directUrl: isolated.directUrl,
    });
    expect(() =>
      requireIsolatedTestDatabase({
        ...child,
        DIRECT_URL: safe.DIRECT_URL,
      }),
    ).toThrow(/same generated codex_test schema/);
    expect(() =>
      requireIsolatedTestDatabase({
        ...child,
        TEST_SCHEMA_NAME: schemaNameForTestRun("testrun-other-1234"),
      }),
    ).toThrow(/same generated codex_test schema/);
    expect(() =>
      requireIsolatedTestDatabase({
        ...child,
        DIRECT_URL: isolated.directUrl.replace("search_path", "unsafe_path"),
      }),
    ).toThrow(/isolated schema search path/);
  });

  it("keeps destructive cleanup restricted to exact generated schemas", () => {
    const source = readFileSync("scripts/test-database-run.ts", "utf8");
    expect(source).toContain("TEST_SCHEMA_PATTERN.test(schemaName)");
    expect(source).toContain("DROP SCHEMA IF EXISTS");
    expect(source).not.toContain("eventPublication.deleteMany");
    expect(source).not.toContain("DISABLE TRIGGER");
  });
});
