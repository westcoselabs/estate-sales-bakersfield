import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  requireDestructiveTestReset,
  requireSafeTestDatabase,
  TEST_DATABASE_CONFIRMATION,
  TEST_DATABASE_RESET_CONFIRMATION,
} from "../../../scripts/test-database-safety";
import { testDatabaseEnvironment } from "../../../scripts/test-database-run";

const safe = {
  NODE_ENV: "test",
  APP_ENV: "test",
  TEST_NEON_ENDPOINT_ID: "ep-isolated-test-123456",
  TEST_DATABASE_CONFIRMATION,
  TEST_DATABASE_URL:
    "postgresql://test_user:secret@ep-isolated-test-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
  TEST_DIRECT_URL:
    "postgresql://test_user:secret@ep-isolated-test-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
} satisfies NodeJS.ProcessEnv;

describe("Test Neon safety guard", () => {
  it("accepts only a matching isolated Test endpoint", () => {
    expect(requireSafeTestDatabase(safe).endpointId).toBe(
      "ep-isolated-test-123456",
    );
    expect(() =>
      requireSafeTestDatabase({ ...safe, APP_ENV: "preview" }),
    ).toThrow(/APP_ENV=test/);
    expect(() =>
      requireSafeTestDatabase({
        ...safe,
        TEST_DATABASE_URL: safe.TEST_DATABASE_URL?.replace(
          "ep-isolated-test-123456-pooler",
          "ep-other-preview-123456-pooler",
        ),
      }),
    ).toThrow(/does not match/);
  });

  it("rejects a known Preview or Production URL even with a Test marker", () => {
    expect(() =>
      requireSafeTestDatabase({
        ...safe,
        PREVIEW_DATABASE_URL: safe.TEST_DATABASE_URL,
      }),
    ).toThrow(/known non-Test database/);
    expect(() =>
      requireSafeTestDatabase({
        ...safe,
        PRODUCTION_DIRECT_URL: safe.TEST_DIRECT_URL,
      }),
    ).toThrow(/known non-Test database/);
  });

  it("requires a separate deliberate marker for destructive reset", () => {
    expect(() => requireDestructiveTestReset(safe)).toThrow(
      /Destructive reset/,
    );
    expect(
      requireDestructiveTestReset({
        ...safe,
        TEST_DATABASE_RESET_CONFIRMATION,
      }).endpointId,
    ).toBe("ep-isolated-test-123456");
  });

  it("removes Preview, Production, Vercel, provider, and Sentry values from test children", () => {
    const child = testDatabaseEnvironment(
      requireSafeTestDatabase(safe),
      "testrun-safety-1234",
      {
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
      },
    );
    expect(child).toMatchObject({
      PATH: "retained-path",
      APP_ENV: "test",
      DATABASE_URL: safe.TEST_DATABASE_URL,
      DIRECT_URL: safe.TEST_DIRECT_URL,
      TEST_RUN_ID: "testrun-safety-1234",
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

  it("keeps append-only audit cleanup scoped to collected Test-run identities", () => {
    const source = readFileSync("scripts/test-database-run.ts", "utf8");
    expect(source).toContain("startsWith: `${runId}-`");
    expect(source).toContain('DISABLE TRIGGER "audit_entries_append_only"');
    expect(source).toContain("actorUserId: { in: userIds }");
    expect(source).toContain("targetId: { in: targetIds }");
    expect(source).toContain('ENABLE TRIGGER "audit_entries_append_only"');
  });
});
