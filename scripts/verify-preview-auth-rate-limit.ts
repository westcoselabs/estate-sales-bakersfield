import { createHash, randomUUID } from "node:crypto";

import { PrismaNeon } from "@prisma/adapter-neon";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";

class ExpectedRollback extends Error {
  override readonly name = "ExpectedRollback";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

if (
  process.env.APP_ENV !== "preview" ||
  process.env.DATABASE_RESOURCE_ENV !== "preview"
) {
  process.stderr.write(
    "BLOCKED: Preview auth rate-limit verification requires APP_ENV=preview and DATABASE_RESOURCE_ENV=preview.\n",
  );
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  process.stderr.write(
    "BLOCKED: Preview auth rate-limit verification requires DATABASE_URL.\n",
  );
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const expectedMigrations = [
  "20260716000000_phase1_foundation",
  "20260717000000_phase2_auth_and_organizers",
  "20260721000000_phase3_event_builder",
  "20260722000000_postgresql_auth_rate_limits",
  "20260723000000_phase4_paid_publication",
  "20260724000000_auth_rate_limit_repair",
] as const;

const expectedTables = [
  "users",
  "sessions",
  "organizer_profiles",
  "events",
  "payment_attempts",
  "authentication_rate_limit_buckets",
] as const;

try {
  const appliedMigrations = await prisma.$queryRaw<
    Array<{ migration_name: string }>
  >(Prisma.sql`
    SELECT "migration_name"
    FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
    ORDER BY "migration_name"
  `);
  const appliedNames = new Set(
    appliedMigrations.map((migration) => migration.migration_name),
  );
  const missingMigrations = expectedMigrations.filter(
    (migration) => !appliedNames.has(migration),
  );
  if (missingMigrations.length > 0) {
    throw new Error(
      `Preview database is missing migrations: ${missingMigrations.join(", ")}`,
    );
  }

  const availableTables = await prisma.$queryRaw<Array<{ table_name: string }>>(
    Prisma.sql`
      SELECT "table_name"::text AS "table_name"
      FROM "information_schema"."tables"
      WHERE "table_schema" = 'public'
        AND "table_name" IN (${Prisma.join(expectedTables)})
      ORDER BY "table_name"
    `,
  );
  const availableNames = new Set(
    availableTables.map((table) => table.table_name),
  );
  const missingTables = expectedTables.filter(
    (table) => !availableNames.has(table),
  );
  if (missingTables.length > 0) {
    throw new Error(
      `Preview database is missing tables: ${missingTables.join(", ")}`,
    );
  }

  const marker = randomUUID();
  const scopeHash = sha256(`preview-auth-rate-limit-smoke:v1:${marker}:scope`);
  const identifierHash = sha256(
    `preview-auth-rate-limit-smoke:v1:${marker}:identifier`,
  );

  await prisma
    .$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ attempt_count: number }>
      >(Prisma.sql`
        INSERT INTO "authentication_rate_limit_buckets" (
          "environment",
          "scope_hash",
          "namespace",
          "identifier_hash",
          "attempt_count",
          "window_started_at",
          "expires_at",
          "updated_at"
        ) VALUES (
          'preview',
          ${scopeHash},
          'register:network',
          ${identifierHash},
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + 60 * INTERVAL '1 second',
          CURRENT_TIMESTAMP
        )
        RETURNING "attempt_count"
      `);

      if (rows[0]?.attempt_count !== 1) {
        throw new Error("Preview auth rate-limit verification returned no row");
      }
      throw new ExpectedRollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof ExpectedRollback)) throw error;
    });

  process.stdout.write(
    `Preview database verified (${expectedMigrations.length} migrations, ${expectedTables.length} required tables, auth rate-limit write rollback).\n`,
  );
  process.stdout.write(
    `Applied Preview migrations verified: ${expectedMigrations.join(", ")}.\n`,
  );
} finally {
  await prisma.$disconnect();
}
