import {
  knownProductionDatabaseEnvironment,
  loadLocalDevelopmentEnvironment,
  requireSafeDevelopmentDatabase,
  TEST_SCHEMA_PATTERN,
} from "./test-database-safety";
import { dropIsolatedTestSchema } from "./test-database-run";

const argument = process.argv[2];
const schemaName = argument?.startsWith("--schema=")
  ? argument.slice("--schema=".length)
  : undefined;
const legacy =
  process.argv.includes("--allow-legacy") &&
  Boolean(schemaName && /^codex_test_[a-f0-9]{20}$/.test(schemaName));
if (!schemaName || (!TEST_SCHEMA_PATTERN.test(schemaName) && !legacy)) {
  throw new Error(
    "Usage: tsx scripts/drop-test-schema.ts --schema=codex_test_<timestamp>_<random>",
  );
}

loadLocalDevelopmentEnvironment();
const database = requireSafeDevelopmentDatabase({
  ...process.env,
  ...knownProductionDatabaseEnvironment(),
});
if (legacy) {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: database.baseDirectUrl }),
  });
  try {
    const locks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*)::bigint AS count
       FROM pg_locks l
       JOIN pg_class c ON c.oid = l.relation
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${schemaName}'`,
    );
    if ((locks[0]?.count ?? 0n) !== 0n) {
      throw new Error(
        "Refusing to remove a legacy test schema with active locks",
      );
    }
    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
} else {
  await dropIsolatedTestSchema({
    ...database,
    pooledUrl: database.basePooledUrl,
    directUrl: database.baseDirectUrl,
    schemaName,
  });
}
process.stdout.write(`Removed isolated test schema ${schemaName}.\n`);
import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";
