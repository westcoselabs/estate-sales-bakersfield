import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

import type { IsolatedTestDatabaseConfiguration } from "./test-database-safety";
import {
  redactTestDatabaseText,
  TEST_SCHEMA_PATTERN,
} from "./test-database-safety";

function assertIsolatedSchemaName(schemaName: string): void {
  if (!TEST_SCHEMA_PATTERN.test(schemaName)) {
    throw new Error("Refusing an operation for an invalid test schema name");
  }
}

async function executeSchemaStatement(
  database: IsolatedTestDatabaseConfiguration,
  statement: string,
): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: database.baseDirectUrl }),
  });
  try {
    await prisma.$executeRawUnsafe(statement);
  } finally {
    await prisma.$disconnect();
  }
}

export async function createIsolatedTestSchema(
  database: IsolatedTestDatabaseConfiguration,
): Promise<void> {
  assertIsolatedSchemaName(database.schemaName);
  await executeSchemaStatement(
    database,
    `CREATE SCHEMA "${database.schemaName}"`,
  );
}

export async function dropIsolatedTestSchema(
  database: IsolatedTestDatabaseConfiguration,
): Promise<void> {
  assertIsolatedSchemaName(database.schemaName);
  await executeSchemaStatement(
    database,
    `DROP SCHEMA IF EXISTS "${database.schemaName}" CASCADE`,
  );
}

export function testDatabaseEnvironment(
  database: IsolatedTestDatabaseConfiguration,
  runId: string,
  parentEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...parentEnvironment,
    NODE_ENV: "test",
    APP_ENV: "test",
    // Neon Pooler rejects PostgreSQL startup options. Tests use the same
    // Development database through its direct endpoint so unqualified raw SQL
    // and Prisma model queries share the disposable schema search path.
    DATABASE_URL: database.directUrl,
    DIRECT_URL: database.directUrl,
    DATABASE_RESOURCE_ENV: "development",
    TEST_RUN_ID: runId,
    TEST_SCHEMA_NAME: database.schemaName,
    CRON_SECRET: undefined,
    AUTH_FINGERPRINT_SECRET: undefined,
    AUTH_EMAIL_CAPTURE_PATH: undefined,
    BLOB_READ_WRITE_TOKEN: undefined,
    BLOB_RESOURCE_ENV: undefined,
    RESEND_API_KEY: undefined,
    RESEND_FROM: undefined,
    RESEND_RESOURCE_ENV: undefined,
    GEOAPIFY_API_KEY: undefined,
    STRIPE_SECRET_KEY: undefined,
    STRIPE_WEBHOOK_SECRET: undefined,
    STRIPE_PRICE_ID: undefined,
    STRIPE_EXPECTED_AMOUNT: undefined,
    STRIPE_EXPECTED_CURRENCY: undefined,
    STRIPE_MODE: undefined,
    STRIPE_RESOURCE_ENV: undefined,
    VERCEL_OIDC_TOKEN: undefined,
    VERCEL_ENV: undefined,
    SENTRY_DSN: undefined,
    NEXT_PUBLIC_SENTRY_DSN: undefined,
  };
  for (const name of Object.keys(environment)) {
    if (
      name.startsWith("VERCEL_") ||
      name.startsWith("PREVIEW_") ||
      name.startsWith("PRODUCTION_") ||
      name.startsWith("NEXT_PUBLIC_")
    ) {
      delete environment[name];
    }
  }
  environment.NEXT_PUBLIC_APP_ENV = "test";
  return environment;
}

export function deployTestMigrations(
  database: IsolatedTestDatabaseConfiguration,
  runId: string,
): void {
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), "estate-sales-bakersfield-test-migrations-"),
  );
  const migrationsPath = path.join(temporaryRoot, "migrations");
  cpSync(path.resolve("prisma/migrations"), migrationsPath, {
    recursive: true,
  });
  const postgisMigrationPath = path.join(
    migrationsPath,
    "20260721000000_phase3_event_builder",
    "migration.sql",
  );
  const postgisMigration = readFileSync(postgisMigrationPath, "utf8");
  const qualifiedPostgisMigration = postgisMigration.replace(
    '"coordinates" geography(Point, 4326)',
    '"coordinates" public.geography(Point, 4326)',
  );
  if (qualifiedPostgisMigration === postgisMigration) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw new Error(
      "The isolated-schema PostGIS migration adaptation no longer matches the committed migration",
    );
  }
  writeFileSync(postgisMigrationPath, qualifiedPostgisMigration, "utf8");

  const isWindows = process.platform === "win32";
  const result = (() => {
    try {
      return spawnSync(
        isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
        isWindows
          ? ["/d", "/s", "/c", "pnpm exec prisma migrate deploy"]
          : ["exec", "prisma", "migrate", "deploy"],
        {
          cwd: process.cwd(),
          env: {
            ...testDatabaseEnvironment(database, runId),
            PRISMA_MIGRATIONS_PATH: migrationsPath,
            // Every invocation owns a different schema and migration table.
            // Prisma's database-wide advisory lock would otherwise serialize
            // or time out independent test-schema migrations.
            PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1",
          },
          encoding: "utf8",
        },
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  })();
  if (result.status !== 0) {
    const evidence = redactTestDatabaseText(
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
      database,
    );
    throw new Error(
      `Development test-schema migration failed with exit code ${String(result.status)}${evidence ? `\n${evidence}` : ""}`,
    );
  }
}
