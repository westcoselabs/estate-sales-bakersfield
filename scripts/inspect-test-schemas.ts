import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

import {
  knownProductionDatabaseEnvironment,
  loadLocalDevelopmentEnvironment,
  requireSafeDevelopmentDatabase,
  runtimeRoleNameForSchema,
  TEST_RUNTIME_ROLE_PATTERN,
  TEST_SCHEMA_PATTERN,
} from "./test-database-safety";

loadLocalDevelopmentEnvironment();
const database = requireSafeDevelopmentDatabase({
  ...process.env,
  ...knownProductionDatabaseEnvironment(),
});
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: database.baseDirectUrl }),
});

try {
  const schemas = await prisma.$queryRaw<Array<{ schemaName: string }>>`
    SELECT schema_name::text AS "schemaName"
    FROM information_schema.schemata
    WHERE schema_name LIKE 'codex_test_%'
    ORDER BY schema_name
  `;
  const runtimeRoles = await prisma.$queryRaw<Array<{ roleName: string }>>`
    SELECT rolname::text AS "roleName"
    FROM pg_roles
    WHERE rolname LIKE 'codex_test_role_%'
    ORDER BY rolname
  `;
  const roleNames = new Set(runtimeRoles.map(({ roleName }) => roleName));
  for (const roleName of roleNames) {
    if (!TEST_RUNTIME_ROLE_PATTERN.test(roleName)) {
      throw new Error("Unexpected test runtime role name");
    }
  }
  const evidence: Array<Record<string, unknown>> = [];
  for (const { schemaName } of schemas) {
    if (
      !/^codex_test_(?:[a-f0-9]{20}|[0-9]{13}_[a-f0-9]{12})$/.test(schemaName)
    ) {
      throw new Error("Unexpected test schema name");
    }
    const migrationTable = await prisma.$queryRawUnsafe<
      Array<{ exists: boolean }>
    >(
      `SELECT to_regclass('"${schemaName}"."_prisma_migrations"') IS NOT NULL AS "exists"`,
    );
    const migrations = migrationTable[0]?.exists
      ? await prisma.$queryRawUnsafe<Array<{ lastMigrationAt: string | null }>>(
          `SELECT max(finished_at)::text AS "lastMigrationAt" FROM "${schemaName}"."_prisma_migrations"`,
        )
      : [];
    const locks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count
       FROM pg_locks l
       JOIN pg_class c ON c.oid = l.relation
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${schemaName}'`,
    );
    const expectedRuntimeRole = TEST_SCHEMA_PATTERN.test(schemaName)
      ? runtimeRoleNameForSchema(schemaName)
      : undefined;
    evidence.push({
      schemaName,
      runtimeRoleName: expectedRuntimeRole,
      runtimeRolePresent: expectedRuntimeRole
        ? roleNames.delete(expectedRuntimeRole)
        : false,
      lastMigrationAt: migrations[0]?.lastMigrationAt ?? null,
      activeLocks: Number(locks[0]?.count ?? 0n),
    });
  }
  for (const roleName of roleNames) {
    evidence.push({ orphanRuntimeRoleName: roleName });
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} finally {
  await prisma.$disconnect();
}
