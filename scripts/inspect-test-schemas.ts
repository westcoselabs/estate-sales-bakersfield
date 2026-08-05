import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

import {
  knownProductionDatabaseEnvironment,
  loadLocalDevelopmentEnvironment,
  requireSafeDevelopmentDatabase,
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
  const evidence = [];
  for (const { schemaName } of schemas) {
    if (
      !/^codex_test_(?:[a-f0-9]{20}|[0-9]{13}_[a-f0-9]{12})$/.test(schemaName)
    ) {
      throw new Error("Unexpected test schema name");
    }
    const migrations = await prisma.$queryRawUnsafe<
      Array<{ lastMigrationAt: string | null }>
    >(
      `SELECT max(finished_at)::text AS "lastMigrationAt" FROM "${schemaName}"."_prisma_migrations"`,
    );
    const locks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count
       FROM pg_locks l
       JOIN pg_class c ON c.oid = l.relation
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${schemaName}'`,
    );
    evidence.push({
      schemaName,
      lastMigrationAt: migrations[0]?.lastMigrationAt ?? null,
      activeLocks: Number(locks[0]?.count ?? 0n),
    });
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} finally {
  await prisma.$disconnect();
}
