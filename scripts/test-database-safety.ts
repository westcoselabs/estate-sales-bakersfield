import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { config, parse } from "dotenv";

export const DEVELOPMENT_DATABASE_CONFIRMATION =
  "estate-sales-bakersfield-development-neon-test-schemas";
export const TEST_SCHEMA_PATTERN = /^codex_test_[0-9]{13}_[a-f0-9]{12}$/;

export interface SafeDevelopmentDatabaseConfiguration {
  readonly basePooledUrl: string;
  readonly baseDirectUrl: string;
  readonly endpointId: string;
}

export interface IsolatedTestDatabaseConfiguration extends SafeDevelopmentDatabaseConfiguration {
  readonly pooledUrl: string;
  readonly directUrl: string;
  readonly schemaName: string;
}

export function loadLocalDevelopmentEnvironment(): void {
  config({ path: ".env.local", override: true, quiet: true });
}

export function loadDevelopmentTestEnvironment(): void {
  loadLocalDevelopmentEnvironment();
  config({ path: ".env.test.local", override: true, quiet: true });
  if (
    !process.env.APP_ENV ||
    !["local", "test"].includes(process.env.APP_ENV)
  ) {
    throw new Error("Test configuration must begin in Local or Test mode");
  }
  if (process.env.DATABASE_RESOURCE_ENV !== "development") {
    throw new Error(
      "Test configuration must explicitly identify Development Neon",
    );
  }
  process.env.APP_ENV = "test";
}

export type KnownProductionDatabaseEnvironment = Partial<
  Record<
    | "PRODUCTION_DATABASE_URL"
    | "PRODUCTION_DIRECT_URL"
    | "PRODUCTION_NEON_ENDPOINT_ID",
    string
  >
>;

export function knownProductionDatabaseEnvironment(): KnownProductionDatabaseEnvironment {
  if (!existsSync(".env")) return {};
  const production = parse(readFileSync(".env"));
  if (
    production.APP_ENV !== "production" ||
    production.DATABASE_RESOURCE_ENV !== "production"
  ) {
    return {};
  }
  const known: KnownProductionDatabaseEnvironment = {};
  if (production.DATABASE_URL) {
    known.PRODUCTION_DATABASE_URL = production.DATABASE_URL;
  }
  if (production.DIRECT_URL) {
    known.PRODUCTION_DIRECT_URL = production.DIRECT_URL;
    const endpointId = new URL(production.DIRECT_URL).hostname.split(".")[0];
    if (endpointId) known.PRODUCTION_NEON_ENDPOINT_ID = endpointId;
  }
  return known;
}

function parseNeonUrl(
  value: string | undefined,
  name: string,
  endpointId: string,
  direct: boolean,
): URL {
  if (!value) throw new Error(`${name} is required`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    throw new Error(`${name} must use PostgreSQL`);
  }
  if (!url.hostname.endsWith(".neon.tech")) {
    throw new Error(`${name} must target the Development Neon endpoint`);
  }
  const endpointHost = url.hostname.split(".")[0];
  const allowedHosts = direct
    ? [endpointId]
    : [endpointId, `${endpointId}-pooler`];
  if (!endpointHost || !allowedHosts.includes(endpointHost)) {
    throw new Error(`${name} does not match DEVELOPMENT_NEON_ENDPOINT_ID`);
  }
  if (url.searchParams.get("sslmode") !== "require") {
    throw new Error(`${name} must require TLS with sslmode=require`);
  }
  if (!url.username || !url.pathname || url.pathname === "/") {
    throw new Error(`${name} is missing a database identity`);
  }
  const configuredSchema = url.searchParams.get("schema");
  if (configuredSchema && configuredSchema !== "public") {
    throw new Error(`${name} must identify the Development database base URL`);
  }
  url.searchParams.delete("schema");
  return url;
}

function equivalentDatabaseUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return (
      a.hostname === b.hostname &&
      a.port === b.port &&
      a.pathname === b.pathname &&
      a.username === b.username
    );
  } catch {
    return left === right;
  }
}

export function requireSafeDevelopmentDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): SafeDevelopmentDatabaseConfiguration {
  if (
    !environment.APP_ENV ||
    !["local", "test"].includes(environment.APP_ENV)
  ) {
    throw new Error(
      "Development database access requires APP_ENV=local or APP_ENV=test",
    );
  }
  if (environment.DATABASE_RESOURCE_ENV !== "development") {
    throw new Error("Database tests require DATABASE_RESOURCE_ENV=development");
  }
  if (
    environment.DEVELOPMENT_DATABASE_CONFIRMATION !==
    DEVELOPMENT_DATABASE_CONFIRMATION
  ) {
    throw new Error(
      "DEVELOPMENT_DATABASE_CONFIRMATION does not authorize isolated test schemas",
    );
  }
  const endpointId = environment.DEVELOPMENT_NEON_ENDPOINT_ID;
  if (!endpointId || !/^ep-[a-z0-9-]{6,80}$/.test(endpointId)) {
    throw new Error("DEVELOPMENT_NEON_ENDPOINT_ID is required and invalid");
  }
  if (
    environment.PRODUCTION_NEON_ENDPOINT_ID &&
    environment.PRODUCTION_NEON_ENDPOINT_ID === endpointId
  ) {
    throw new Error(
      "Development and Production Neon endpoint identifiers must differ",
    );
  }

  const pooled = parseNeonUrl(
    environment.DATABASE_URL,
    "DATABASE_URL",
    endpointId,
    false,
  );
  const direct = parseNeonUrl(
    environment.DIRECT_URL,
    "DIRECT_URL",
    endpointId,
    true,
  );
  if (
    pooled.pathname !== direct.pathname ||
    pooled.username !== direct.username
  ) {
    throw new Error(
      "Development Neon pooled and direct URLs identify different databases",
    );
  }

  const knownNonDevelopmentUrls = [
    environment.PREVIEW_DATABASE_URL,
    environment.PREVIEW_DIRECT_URL,
    environment.PRODUCTION_DATABASE_URL,
    environment.PRODUCTION_DIRECT_URL,
  ].filter((value): value is string => Boolean(value));
  for (const known of knownNonDevelopmentUrls) {
    if (
      equivalentDatabaseUrl(pooled.toString(), known) ||
      equivalentDatabaseUrl(direct.toString(), known)
    ) {
      throw new Error(
        "Development Neon configuration matches a known non-Development database and was rejected",
      );
    }
  }

  return {
    basePooledUrl: pooled.toString(),
    baseDirectUrl: direct.toString(),
    endpointId,
  };
}

export function schemaNameForTestRun(runId: string): string {
  if (!/^testrun-[a-z0-9-]+$/.test(runId) || runId.length > 100) {
    throw new Error("Test-run identifier is invalid");
  }
  return `codex_test_${String(Date.now())}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function urlForSchema(value: string, schemaName: string): string {
  const url = new URL(value);
  url.searchParams.set("schema", schemaName);
  url.searchParams.set("options", `-c search_path=${schemaName},public`);
  return url.toString();
}

export function isolateDevelopmentDatabase(
  database: SafeDevelopmentDatabaseConfiguration,
  runId: string,
): IsolatedTestDatabaseConfiguration {
  const schemaName = schemaNameForTestRun(runId);
  return {
    ...database,
    pooledUrl: urlForSchema(database.basePooledUrl, schemaName),
    directUrl: urlForSchema(database.baseDirectUrl, schemaName),
    schemaName,
  };
}

export function requireIsolatedTestDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): IsolatedTestDatabaseConfiguration {
  if (environment.APP_ENV !== "test") {
    throw new Error("Isolated database access requires APP_ENV=test");
  }
  const pooledValue = environment.DATABASE_URL;
  const directValue = environment.DIRECT_URL;
  if (!pooledValue || !directValue) {
    throw new Error("Isolated tests require DATABASE_URL and DIRECT_URL");
  }

  const pooled = new URL(pooledValue);
  const direct = new URL(directValue);
  const pooledSchema = pooled.searchParams.get("schema");
  const directSchema = direct.searchParams.get("schema");
  if (
    !pooledSchema ||
    pooledSchema !== directSchema ||
    environment.TEST_SCHEMA_NAME !== pooledSchema ||
    !TEST_SCHEMA_PATTERN.test(pooledSchema)
  ) {
    throw new Error(
      "Test database URLs and TEST_SCHEMA_NAME must target the same generated codex_test schema",
    );
  }
  const expectedOptions = `-c search_path=${pooledSchema},public`;
  if (
    pooled.searchParams.get("options") !== expectedOptions ||
    direct.searchParams.get("options") !== expectedOptions
  ) {
    throw new Error(
      "Test database URLs must use the isolated schema search path",
    );
  }

  pooled.searchParams.delete("schema");
  pooled.searchParams.delete("options");
  direct.searchParams.delete("schema");
  direct.searchParams.delete("options");
  const base = requireSafeDevelopmentDatabase({
    ...environment,
    DATABASE_URL: pooled.toString(),
    DIRECT_URL: direct.toString(),
  });
  return {
    ...base,
    pooledUrl: pooledValue,
    directUrl: directValue,
    schemaName: pooledSchema,
  };
}

export function redactTestDatabaseText(
  value: string,
  database:
    SafeDevelopmentDatabaseConfiguration | IsolatedTestDatabaseConfiguration,
): string {
  let redacted = value
    .split(database.basePooledUrl)
    .join("[REDACTED_DEVELOPMENT_DATABASE_URL]")
    .split(database.baseDirectUrl)
    .join("[REDACTED_DEVELOPMENT_DIRECT_URL]");
  if ("pooledUrl" in database) {
    redacted = redacted
      .split(database.pooledUrl)
      .join("[REDACTED_TEST_SCHEMA_DATABASE_URL]")
      .split(database.directUrl)
      .join("[REDACTED_TEST_SCHEMA_DIRECT_URL]");
  }
  return redacted;
}

export function createTestRunId(): string {
  return `testrun-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
