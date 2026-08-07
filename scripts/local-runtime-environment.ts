import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

import {
  loadLocalDevelopmentEnvironment,
  requireSafeDevelopmentDatabase,
} from "./test-database-safety";

const sensitiveNames = [
  "DATABASE_URL",
  "DIRECT_URL",
  "CRON_SECRET",
  "AUTH_FINGERPRINT_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "RESEND_WEBHOOK_SECRET",
  "GEOAPIFY_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "VERCEL_OIDC_TOKEN",
] as const;

const providerPairs = [
  ["BLOB_READ_WRITE_TOKEN", "BLOB_RESOURCE_ENV"],
  ["RESEND_API_KEY", "RESEND_RESOURCE_ENV"],
  ["STRIPE_SECRET_KEY", "STRIPE_RESOURCE_ENV"],
] as const;

function productionDotEnv(): Record<string, string | undefined> {
  if (!existsSync(".env")) return {};
  const parsed = parse(readFileSync(".env"));
  return parsed.APP_ENV === "production" ? parsed : {};
}

export function prepareLocalRuntimeEnvironment(
  nodeEnvironment: "development" | "production",
): NodeJS.ProcessEnv {
  loadLocalDevelopmentEnvironment();
  return buildLocalRuntimeEnvironment(
    process.env,
    productionDotEnv(),
    nodeEnvironment,
  );
}

export function buildLocalRuntimeEnvironment(
  local: NodeJS.ProcessEnv,
  production: Record<string, string | undefined>,
  nodeEnvironment: "development" | "production",
): NodeJS.ProcessEnv {
  if (local.APP_ENV !== "local") {
    throw new Error("Local commands require APP_ENV=local in .env.local");
  }
  const productionEndpointId = production.DIRECT_URL
    ? new URL(production.DIRECT_URL).hostname.split(".")[0]
    : undefined;
  const database = requireSafeDevelopmentDatabase({
    ...local,
    PRODUCTION_DATABASE_URL: production.DATABASE_URL,
    PRODUCTION_DIRECT_URL: production.DIRECT_URL,
    PRODUCTION_NEON_ENDPOINT_ID:
      productionEndpointId ?? local.PRODUCTION_NEON_ENDPOINT_ID,
  });

  for (const name of sensitiveNames) {
    if (local[name] && production[name] && local[name] === production[name]) {
      throw new Error(
        `Local command rejected because ${name} matches the Production environment`,
      );
    }
  }
  for (const [credential, marker] of providerPairs) {
    if (local[credential] && local[marker] !== "local") {
      throw new Error(
        `Local command requires ${marker}=local when ${credential} is configured`,
      );
    }
  }
  if (local.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    throw new Error("Local commands cannot use a live Stripe secret key");
  }

  const environment: NodeJS.ProcessEnv = {
    ...local,
    NODE_ENV: nodeEnvironment,
    APP_ENV: "local",
    NEXT_PUBLIC_APP_ENV: "local",
    DATABASE_URL: database.basePooledUrl,
    DIRECT_URL: database.baseDirectUrl,
    DATABASE_RESOURCE_ENV: "development",
    PRODUCTION_BETA_MODE: "false",
    EMAIL_CAMPAIGNS_ENABLED: "false",
    VERCEL_ENV: "",
    VERCEL_OIDC_TOKEN: "",
  };
  for (const name of sensitiveNames) {
    environment[name] ??= "";
  }
  for (const name of Object.keys(environment)) {
    if (name.startsWith("PRODUCTION_") || name.startsWith("PREVIEW_")) {
      delete environment[name];
    }
  }
  return environment;
}
