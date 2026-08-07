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
  runtimeRoleNameForSchema,
  TEST_SCHEMA_PATTERN,
} from "./test-database-safety";
import type {
  SafeDevelopmentDatabaseConfiguration,
  TestRuntimeDatabaseConfiguration,
} from "./test-database-safety";

function assertIsolatedSchemaName(schemaName: string): void {
  if (!TEST_SCHEMA_PATTERN.test(schemaName)) {
    throw new Error("Refusing an operation for an invalid test schema name");
  }
}

async function executeSchemaStatement(
  database: SafeDevelopmentDatabaseConfiguration,
  operation: (prisma: PrismaClient) => Promise<void>,
): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: database.baseDirectUrl }),
  });
  try {
    await operation(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

interface TestLifecycleCapabilities {
  readonly canCreateRole: boolean;
  readonly canCreateSchema: boolean;
  readonly ownsDatabase: boolean;
  readonly postgisInstalled: boolean;
}

export async function verifyTestLifecycleCapabilities(
  database: SafeDevelopmentDatabaseConfiguration,
): Promise<void> {
  await executeSchemaStatement(database, async (prisma) => {
    const [capabilities] = await prisma.$queryRaw<TestLifecycleCapabilities[]>`
      SELECT
        (roles.rolcreaterole OR roles.rolsuper) AS "canCreateRole",
        has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateSchema",
        databases.datdba = roles.oid AS "ownsDatabase",
        EXISTS (
          SELECT 1
          FROM pg_extension
          WHERE extname = 'postgis'
        ) AS "postgisInstalled"
      FROM pg_roles AS roles
      INNER JOIN pg_database AS databases
        ON databases.datname = current_database()
      WHERE roles.rolname = current_user
    `;
    if (
      !capabilities?.canCreateRole ||
      !capabilities.canCreateSchema ||
      !capabilities.ownsDatabase ||
      !capabilities.postgisInstalled
    ) {
      throw new Error(
        "Development test lifecycle credentials must own the Development database, have CREATEROLE, and use pre-provisioned PostGIS",
      );
    }
  });
}

export async function createIsolatedTestSchema(
  database: IsolatedTestDatabaseConfiguration,
): Promise<void> {
  assertIsolatedSchemaName(database.schemaName);
  if (
    database.runtimeRoleName !== runtimeRoleNameForSchema(database.schemaName)
  ) {
    throw new Error("Test runtime role does not match its generated schema");
  }
  const runtimePassword = new URL(database.directUrl).password;
  if (!/^[A-Za-z0-9_-]{43}$/.test(runtimePassword)) {
    throw new Error("Generated test runtime credential is invalid");
  }
  await verifyTestLifecycleCapabilities(database);
  await executeSchemaStatement(database, async (prisma) => {
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRawUnsafe(
          `SELECT
             set_config('esb.test_runtime_role', $1, true),
             set_config('esb.test_runtime_password', $2, true),
             set_config('esb.test_runtime_schema', $3, true),
             set_config('esb.test_runtime_expiry', $4, true)`,
          database.runtimeRoleName,
          runtimePassword,
          database.schemaName,
          new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        );
        await transaction.$executeRawUnsafe(`
          DO $test_runtime$
          DECLARE
            runtime_role text := current_setting('esb.test_runtime_role');
            runtime_password text := current_setting('esb.test_runtime_password');
            runtime_schema text := current_setting('esb.test_runtime_schema');
            runtime_expiry text := current_setting('esb.test_runtime_expiry');
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
              RAISE EXCEPTION 'generated test runtime role already exists';
            END IF;
            IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = runtime_schema) THEN
              RAISE EXCEPTION 'generated test schema already exists';
            END IF;

            EXECUTE format(
              'CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 32 VALID UNTIL %L',
              runtime_role,
              runtime_password,
              runtime_expiry
            );
            EXECUTE format(
              'GRANT %I TO %I WITH SET TRUE',
              runtime_role,
              current_user
            );
            EXECUTE format(
              'GRANT CONNECT ON DATABASE %I TO %I',
              current_database(),
              runtime_role
            );
            EXECUTE format(
              'CREATE SCHEMA %I AUTHORIZATION %I',
              runtime_schema,
              runtime_role
            );
          END
          $test_runtime$;
        `);
      });
    } catch (error: unknown) {
      const detail =
        error instanceof Error
          ? redactTestDatabaseText(error.message, database)
          : "unknown database error";
      throw new Error(
        `Failed to create the restricted Development test role and schema. Verify that the Development-only lifecycle credential owns the database and can create roles. ${detail}`,
      );
    }
  });
}

export async function dropIsolatedTestSchema(
  database: SafeDevelopmentDatabaseConfiguration,
  schemaName: string,
  runtimeRoleName: string | undefined = runtimeRoleNameForSchema(schemaName),
): Promise<void> {
  assertIsolatedSchemaName(schemaName);
  if (
    runtimeRoleName !== undefined &&
    runtimeRoleName !== runtimeRoleNameForSchema(schemaName)
  ) {
    throw new Error("Refusing cleanup for a mismatched test runtime role");
  }
  await executeSchemaStatement(database, async (prisma) => {
    if (runtimeRoleName) {
      await prisma.$queryRawUnsafe(
        `SELECT pg_terminate_backend(activity.pid)
         FROM pg_stat_activity AS activity
         WHERE activity.usename = $1
           AND activity.pid <> pg_backend_pid()`,
        runtimeRoleName,
      );
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        `SELECT
           set_config('esb.test_runtime_schema', $1, true),
           set_config('esb.test_runtime_role', $2, true)`,
        schemaName,
        runtimeRoleName ?? "",
      );
      await transaction.$executeRawUnsafe(`
        DO $test_runtime_cleanup$
        DECLARE
          runtime_schema text := current_setting('esb.test_runtime_schema');
          runtime_role text := current_setting('esb.test_runtime_role');
        BEGIN
          EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', runtime_schema);
          IF runtime_role <> '' AND EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname = runtime_role
          ) THEN
            EXECUTE format(
              'REVOKE CONNECT ON DATABASE %I FROM %I',
              current_database(),
              runtime_role
            );
            EXECUTE format('DROP ROLE %I', runtime_role);
          END IF;
        END
        $test_runtime_cleanup$;
      `);
    });
    const [cleanup] = await prisma.$queryRawUnsafe<
      Array<{ roleExists: boolean; schemaExists: boolean }>
    >(
      `SELECT
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS "roleExists",
         EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $2) AS "schemaExists"`,
      runtimeRoleName ?? "",
      schemaName,
    );
    if (cleanup?.roleExists || cleanup?.schemaExists) {
      throw new Error(
        "Restricted test runtime cleanup did not remove its exact schema and role",
      );
    }
  });
}

export function testDatabaseEnvironment(
  database: TestRuntimeDatabaseConfiguration,
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
    DEVELOPMENT_NEON_ENDPOINT_ID: database.endpointId,
    PRODUCTION_NEON_ENDPOINT_ID: database.productionEndpointId,
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
      (name.startsWith("PRODUCTION_") &&
        name !== "PRODUCTION_NEON_ENDPOINT_ID") ||
      name.startsWith("NEXT_PUBLIC_")
    ) {
      delete environment[name];
    }
  }
  delete environment.DEVELOPMENT_DATABASE_URL;
  delete environment.DEVELOPMENT_DIRECT_URL;
  environment.NEXT_PUBLIC_APP_ENV = "test";
  return environment;
}

interface RestrictedRuntimeEvidence {
  readonly currentUser: string;
  readonly currentSchema: string | null;
  readonly isSuperuser: boolean;
  readonly canCreateRole: boolean;
  readonly canCreateDatabase: boolean;
  readonly bypassesRls: boolean;
  readonly inheritsPrivileges: boolean;
  readonly canCreateSchema: boolean;
  readonly canCreateInRuntimeSchema: boolean;
  readonly canUsePublic: boolean;
  readonly canCreateInPublic: boolean;
  readonly canCreateInOtherSchema: boolean;
  readonly canReadPublicApplicationData: boolean;
  readonly canWritePublicData: boolean;
  readonly ownsOtherSchema: boolean;
  readonly membershipCount: number;
}

export async function verifyRestrictedTestRuntime(
  database: TestRuntimeDatabaseConfiguration,
): Promise<void> {
  assertIsolatedSchemaName(database.schemaName);
  if (
    database.runtimeRoleName !== runtimeRoleNameForSchema(database.schemaName)
  ) {
    throw new Error("Restricted test runtime role identity is invalid");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: database.directUrl }),
  });
  try {
    const [evidence] = await prisma.$queryRaw<RestrictedRuntimeEvidence[]>`
      SELECT
        current_user::text AS "currentUser",
        current_schema()::text AS "currentSchema",
        roles.rolsuper AS "isSuperuser",
        roles.rolcreaterole AS "canCreateRole",
        roles.rolcreatedb AS "canCreateDatabase",
        roles.rolbypassrls AS "bypassesRls",
        roles.rolinherit AS "inheritsPrivileges",
        has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateSchema",
        has_schema_privilege(current_user, ${database.schemaName}, 'CREATE') AS "canCreateInRuntimeSchema",
        has_schema_privilege(current_user, 'public', 'USAGE') AS "canUsePublic",
        has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateInPublic",
        EXISTS (
          SELECT 1
          FROM pg_namespace AS namespaces
          WHERE namespaces.nspname <> ${database.schemaName}
            AND namespaces.nspname <> 'public'
            AND namespaces.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
            AND namespaces.nspname <> 'information_schema'
            AND has_schema_privilege(current_user, namespaces.oid, 'CREATE')
        ) AS "canCreateInOtherSchema",
        EXISTS (
          SELECT 1
          FROM pg_class AS relations
          INNER JOIN pg_namespace AS namespaces
            ON namespaces.oid = relations.relnamespace
          WHERE namespaces.nspname = 'public'
            AND relations.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND NOT EXISTS (
              SELECT 1
              FROM pg_depend AS dependencies
              INNER JOIN pg_extension AS extensions
                ON extensions.oid = dependencies.refobjid
              WHERE dependencies.classid = 'pg_class'::regclass
                AND dependencies.objid = relations.oid
                AND dependencies.deptype = 'e'
            )
            AND has_table_privilege(current_user, relations.oid, 'SELECT')
        ) AS "canReadPublicApplicationData",
        EXISTS (
          SELECT 1
          FROM pg_class AS relations
          INNER JOIN pg_namespace AS namespaces
            ON namespaces.oid = relations.relnamespace
          WHERE namespaces.nspname = 'public'
            AND relations.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND (
              has_table_privilege(current_user, relations.oid, 'INSERT') OR
              has_table_privilege(current_user, relations.oid, 'UPDATE') OR
              has_table_privilege(current_user, relations.oid, 'DELETE') OR
              has_table_privilege(current_user, relations.oid, 'TRUNCATE')
            )
        ) AS "canWritePublicData",
        EXISTS (
          SELECT 1
          FROM pg_namespace AS namespaces
          WHERE namespaces.nspowner = roles.oid
            AND namespaces.nspname <> ${database.schemaName}
            AND namespaces.nspname NOT LIKE 'pg\\_temp\\_%' ESCAPE '\\'
        ) AS "ownsOtherSchema",
        (
          SELECT count(*)::int
          FROM pg_auth_members AS memberships
          WHERE memberships.member = roles.oid
        ) AS "membershipCount"
      FROM pg_roles AS roles
      WHERE roles.rolname = current_user
    `;
    if (
      !evidence ||
      evidence.currentUser !== database.runtimeRoleName ||
      evidence.currentSchema !== database.schemaName ||
      evidence.isSuperuser ||
      evidence.canCreateRole ||
      evidence.canCreateDatabase ||
      evidence.bypassesRls ||
      evidence.inheritsPrivileges ||
      evidence.canCreateSchema ||
      !evidence.canCreateInRuntimeSchema ||
      !evidence.canUsePublic ||
      evidence.canCreateInPublic ||
      evidence.canCreateInOtherSchema ||
      evidence.canReadPublicApplicationData ||
      evidence.canWritePublicData ||
      evidence.ownsOtherSchema ||
      evidence.membershipCount !== 0
    ) {
      throw new Error(
        "Generated test runtime is not restricted to its isolated schema",
      );
    }

    const forbiddenSchema = `codex_forbidden_${database.schemaName.slice(-12)}`;
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        `SELECT set_config('esb.test_forbidden_schema', $1, true)`,
        forbiddenSchema,
      );
      await transaction.$executeRawUnsafe(`
        DO $negative_schema_probe$
        DECLARE
          denied boolean := false;
        BEGIN
          BEGIN
            EXECUTE format(
              'CREATE SCHEMA %I',
              current_setting('esb.test_forbidden_schema')
            );
          EXCEPTION WHEN insufficient_privilege THEN
            denied := true;
          END;
          IF NOT denied THEN
            RAISE EXCEPTION 'restricted runtime created an arbitrary schema';
          END IF;
        END
        $negative_schema_probe$;
      `);
    });
    await prisma.$executeRawUnsafe(`
      DO $negative_public_probe$
      DECLARE
        denied boolean := false;
      BEGIN
        BEGIN
          EXECUTE 'UPDATE public.events SET updated_at = updated_at WHERE false';
        EXCEPTION WHEN insufficient_privilege THEN
          denied := true;
        END;
        IF NOT denied THEN
          RAISE EXCEPTION 'restricted runtime mutated a qualified public table';
        END IF;
      END
      $negative_public_probe$;
    `);
  } finally {
    await prisma.$disconnect();
  }
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
  const foundationMigrationPath = path.join(
    migrationsPath,
    "20260716000000_phase1_foundation",
    "migration.sql",
  );
  const foundationMigration = readFileSync(foundationMigrationPath, "utf8");
  const restrictedFoundationMigration = foundationMigration.replace(
    "CREATE EXTENSION IF NOT EXISTS postgis;",
    "-- PostGIS is pre-provisioned in Development and is not owned by the test runtime.",
  );
  if (restrictedFoundationMigration === foundationMigration) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw new Error(
      "The isolated-schema PostGIS extension adaptation no longer matches the committed migration",
    );
  }
  writeFileSync(foundationMigrationPath, restrictedFoundationMigration, "utf8");
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
