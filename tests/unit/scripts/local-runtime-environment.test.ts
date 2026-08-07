import { describe, expect, it } from "vitest";

import { buildLocalRuntimeEnvironment } from "../../../scripts/local-runtime-environment";
import { DEVELOPMENT_DATABASE_CONFIRMATION } from "../../../scripts/test-database-safety";

const local = {
  NODE_ENV: "development",
  APP_ENV: "local",
  DATABASE_RESOURCE_ENV: "development",
  DATABASE_URL:
    "postgresql://development_user:secret@ep-development-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
  DIRECT_URL:
    "postgresql://development_user:secret@ep-development-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
  DEVELOPMENT_NEON_ENDPOINT_ID: "ep-development-123456",
  PRODUCTION_NEON_ENDPOINT_ID: "ep-production-123456",
  DEVELOPMENT_DATABASE_CONFIRMATION,
  PATH: "retained-path",
} satisfies NodeJS.ProcessEnv;

const production = {
  APP_ENV: "production",
  DATABASE_RESOURCE_ENV: "production",
  DATABASE_URL:
    "postgresql://production_user:secret@ep-production-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
  DIRECT_URL:
    "postgresql://production_user:secret@ep-production-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
};

describe("local Next runtime environment", () => {
  it("pins Development identity and strips deployment selectors", () => {
    const result = buildLocalRuntimeEnvironment(
      {
        ...local,
        PREVIEW_DATABASE_URL: "preview-value",
        PRODUCTION_DATABASE_URL: "production-value",
        VERCEL_ENV: "production",
        VERCEL_OIDC_TOKEN: "",
      },
      production,
      "production",
    );
    expect(result).toMatchObject({
      NODE_ENV: "production",
      APP_ENV: "local",
      NEXT_PUBLIC_APP_ENV: "local",
      DATABASE_RESOURCE_ENV: "development",
      PATH: "retained-path",
      VERCEL_ENV: "",
      SENTRY_DSN: "",
      AUTH_FINGERPRINT_SECRET: "",
    });
    expect(result.PREVIEW_DATABASE_URL).toBeUndefined();
    expect(result.PRODUCTION_DATABASE_URL).toBeUndefined();
  });

  it("rejects missing Local scope and Production database identity", () => {
    expect(() =>
      buildLocalRuntimeEnvironment(
        { ...local, APP_ENV: "production" },
        production,
        "development",
      ),
    ).toThrow(/APP_ENV=local/);
    expect(() =>
      buildLocalRuntimeEnvironment(
        {
          ...local,
          DATABASE_URL: production.DATABASE_URL,
          DIRECT_URL: production.DIRECT_URL,
          DEVELOPMENT_NEON_ENDPOINT_ID: "ep-production-123456",
        },
        production,
        "development",
      ),
    ).toThrow(/must differ|matches a known non-Development|does not match/);
    expect(() =>
      buildLocalRuntimeEnvironment(
        { ...local, PRODUCTION_NEON_ENDPOINT_ID: undefined },
        {},
        "development",
      ),
    ).toThrow(/PRODUCTION_NEON_ENDPOINT_ID is required/);
  });

  it.each([
    ["BLOB_READ_WRITE_TOKEN", "BLOB_RESOURCE_ENV"],
    ["RESEND_API_KEY", "RESEND_RESOURCE_ENV"],
    ["STRIPE_SECRET_KEY", "STRIPE_RESOURCE_ENV"],
  ] as const)(
    "rejects %s without a Local provider marker",
    (credential, marker) => {
      expect(() =>
        buildLocalRuntimeEnvironment(
          { ...local, [credential]: "configured", [marker]: "production" },
          production,
          "development",
        ),
      ).toThrow(new RegExp(`${marker}=local`));
    },
  );

  it.each([
    "CRON_SECRET",
    "AUTH_FINGERPRINT_SECRET",
    "SENTRY_DSN",
    "NEXT_PUBLIC_SENTRY_DSN",
  ] as const)("rejects a %s value copied from Production", (name) => {
    expect(() =>
      buildLocalRuntimeEnvironment(
        { ...local, [name]: "same-production-secret" },
        { ...production, [name]: "same-production-secret" },
        "development",
      ),
    ).toThrow(new RegExp(name));
  });

  it("rejects live Stripe in Local mode", () => {
    expect(() =>
      buildLocalRuntimeEnvironment(
        {
          ...local,
          STRIPE_SECRET_KEY: `sk_live_${"x".repeat(24)}`,
          STRIPE_RESOURCE_ENV: "local",
        },
        production,
        "development",
      ),
    ).toThrow(/live Stripe/);
  });
});
