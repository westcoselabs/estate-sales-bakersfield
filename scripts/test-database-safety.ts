import { config } from "dotenv";

export const TEST_DATABASE_CONFIRMATION =
  "estate-sales-bakersfield-isolated-test-neon";
export const TEST_DATABASE_RESET_CONFIRMATION =
  "reset-estate-sales-bakersfield-isolated-test-neon";

export interface SafeTestDatabaseConfiguration {
  readonly pooledUrl: string;
  readonly directUrl: string;
  readonly endpointId: string;
}

export function loadDedicatedTestEnvironment(): void {
  config({ path: ".env.test.local", override: true, quiet: true });
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
    throw new Error(`${name} must target an isolated Neon endpoint`);
  }
  const endpointHost = url.hostname.split(".")[0];
  const allowedHosts = direct
    ? [endpointId]
    : [endpointId, `${endpointId}-pooler`];
  if (!endpointHost || !allowedHosts.includes(endpointHost)) {
    throw new Error(`${name} does not match TEST_NEON_ENDPOINT_ID`);
  }
  if (url.searchParams.get("sslmode") !== "require") {
    throw new Error(`${name} must require TLS with sslmode=require`);
  }
  if (!url.username || !url.pathname || url.pathname === "/") {
    throw new Error(`${name} is missing a database identity`);
  }
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

export function requireSafeTestDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): SafeTestDatabaseConfiguration {
  if (environment.APP_ENV !== "test") {
    throw new Error("Database tests require APP_ENV=test");
  }
  if (environment.TEST_DATABASE_CONFIRMATION !== TEST_DATABASE_CONFIRMATION) {
    throw new Error(
      "TEST_DATABASE_CONFIRMATION does not confirm the isolated Test Neon branch",
    );
  }
  const endpointId = environment.TEST_NEON_ENDPOINT_ID;
  if (!endpointId || !/^ep-[a-z0-9-]{6,80}$/.test(endpointId)) {
    throw new Error("TEST_NEON_ENDPOINT_ID is required and invalid");
  }

  const pooled = parseNeonUrl(
    environment.TEST_DATABASE_URL,
    "TEST_DATABASE_URL",
    endpointId,
    false,
  );
  const direct = parseNeonUrl(
    environment.TEST_DIRECT_URL,
    "TEST_DIRECT_URL",
    endpointId,
    true,
  );
  if (
    pooled.pathname !== direct.pathname ||
    pooled.username !== direct.username
  ) {
    throw new Error(
      "Test Neon pooled and direct URLs identify different databases",
    );
  }

  const knownNonTestUrls = [
    environment.DATABASE_URL,
    environment.DIRECT_URL,
    environment.PREVIEW_DATABASE_URL,
    environment.PREVIEW_DIRECT_URL,
    environment.PRODUCTION_DATABASE_URL,
    environment.PRODUCTION_DIRECT_URL,
  ].filter((value): value is string => Boolean(value));
  for (const known of knownNonTestUrls) {
    if (
      equivalentDatabaseUrl(pooled.toString(), known) ||
      equivalentDatabaseUrl(direct.toString(), known)
    ) {
      throw new Error(
        "Test Neon configuration matches a known non-Test database and was rejected",
      );
    }
  }

  return {
    pooledUrl: environment.TEST_DATABASE_URL as string,
    directUrl: environment.TEST_DIRECT_URL as string,
    endpointId,
  };
}

export function requireDestructiveTestReset(
  environment: NodeJS.ProcessEnv = process.env,
): SafeTestDatabaseConfiguration {
  const database = requireSafeTestDatabase(environment);
  if (
    environment.TEST_DATABASE_RESET_CONFIRMATION !==
    TEST_DATABASE_RESET_CONFIRMATION
  ) {
    throw new Error(
      "Destructive reset requires TEST_DATABASE_RESET_CONFIRMATION for the isolated Test Neon branch",
    );
  }
  return database;
}

export function redactTestDatabaseText(
  value: string,
  database: SafeTestDatabaseConfiguration,
): string {
  return value
    .split(database.pooledUrl)
    .join("[REDACTED_TEST_DATABASE_URL]")
    .split(database.directUrl)
    .join("[REDACTED_TEST_DIRECT_URL]");
}

export function createTestRunId(): string {
  return `testrun-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}
