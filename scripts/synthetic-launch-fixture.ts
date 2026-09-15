import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import { requireIsolatedTestDatabase } from "./test-database-safety";

/** Never seeds the shared Development or Production application schema. */
export async function seedSyntheticLaunchFixture(
  prisma: PrismaClient,
  options: { users: number; listings: number; anchor: Date },
) {
  const database = requireIsolatedTestDatabase();
  const [identity] = await prisma.$queryRaw<
    Array<{ schema: string; role: string; privileged: boolean }>
  >`
    SELECT current_schema()::text AS schema, current_user::text AS role, (rolsuper OR rolcreaterole) AS privileged
    FROM pg_roles WHERE rolname=current_user`;
  if (
    identity?.schema !== database.schemaName ||
    identity.role !== database.runtimeRoleName ||
    identity.privileged
  )
    throw new Error("Fixture requires a generated restricted test schema");
  if (
    (await prisma.user.count()) ||
    (await prisma.event.count()) ||
    (await prisma.externalListing.count())
  )
    throw new Error("Fixture requires empty test tables");
  if (
    !Number.isInteger(options.users) ||
    options.users < 1000 ||
    options.users > 100_000 ||
    !Number.isInteger(options.listings) ||
    options.listings < 100 ||
    options.listings > 10_000 ||
    options.listings % 2
  )
    throw new Error("Invalid bounded fixture size");
  const source = await readFile(
    new URL("../tests/performance/seed-public-search.sql", import.meta.url),
    "utf8",
  );
  const sql = source
    .replaceAll(
      "'2030-05-01T15:00:00Z'::timestamptz",
      "current_setting('benchmark.anchor')::timestamptz",
    )
    .replaceAll(
      "'2030-05-01T21:00:00Z'::timestamptz",
      "(current_setting('benchmark.anchor')::timestamptz + interval '6 hours')",
    );
  await prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT set_config('benchmark.users',${String(options.users)},true), set_config('benchmark.listings',${String(options.listings)},true), set_config('benchmark.anchor',${options.anchor.toISOString()},true)`,
      );
      for (const statement of sql
        .split(/^-- @statement\r?$/m)
        .map((part) => part.trim())
        .filter(Boolean))
        await transaction.$executeRawUnsafe(statement);
    },
    { timeout: 180_000, maxWait: 10_000 },
  );
  const counts = {
    users: await prisma.user.count(),
    publications: await prisma.eventPublication.count(),
    externalListings: await prisma.externalListing.count(),
  };
  if (
    counts.users !== options.users ||
    counts.publications !== options.listings / 2 ||
    counts.externalListings !== options.listings / 2
  )
    throw new Error("Fixture row count mismatch");
  return {
    counts,
    anchor: options.anchor.toISOString(),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
  };
}
