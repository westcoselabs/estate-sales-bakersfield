import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createNeonAdapter } from "../src/platform/database/neon-adapter";
import {
  redactTestDatabaseText,
  requireIsolatedTestDatabase,
} from "./test-database-safety";

if (process.argv.slice(2).join(" ") !== "--run") {
  throw new Error(
    "Use with-test-schema.ts -- node --conditions=react-server --import tsx scripts/rehearse-launch-migrations.ts --run",
  );
}
const database = requireIsolatedTestDatabase();
const runId = process.env.TEST_RUN_ID;
if (!runId || !/^testrun-[a-z0-9-]+$/.test(runId))
  throw new Error("A generated TEST_RUN_ID is required");
const prisma = new PrismaClient({
  adapter: createNeonAdapter(database.directUrl),
});
const migrations = [
  "20260915010000_public_search_projection",
  "20260915020000_admin_mfa",
] as const;
const report: Record<string, unknown> = {
  schema: "launch-migration-rehearsal-v1",
  capturedAt: new Date().toISOString(),
  runtime: process.version,
  limitations: [
    "Synthetic populated-schema rehearsal, not a Production backup/restore or rollout.",
    "Only the two new migrations are reversed, while the wrapper-owned schema is empty, then replayed over fixtures.",
    "Migration SQL is executed transactionally in a DO block; Prisma deployment orchestration is outside this check.",
    "Wall times include adapter/network overhead. No competing writers, Production inventory, or Production compute were measured.",
  ],
};
let phase = "guard";

async function publicationFingerprint(): Promise<string> {
  const [row] = await prisma.$queryRaw<Array<{ fingerprint: string }>>`
    SELECT md5(string_agg(id::text || snapshot::text, '' ORDER BY id)) AS fingerprint
    FROM event_publications
  `;
  if (!row?.fingerprint) throw new Error("Populated publications are required");
  return row.fingerprint;
}

try {
  const [identity] = await prisma.$queryRaw<
    Array<{ schema: string; role: string; privileged: boolean; empty: boolean }>
  >`
    SELECT current_schema()::text AS schema, current_user::text AS role,
      (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls) AS privileged,
      (NOT EXISTS (SELECT 1 FROM users) AND
       NOT EXISTS (SELECT 1 FROM event_publications) AND
       NOT EXISTS (SELECT 1 FROM external_listings)) AS empty
    FROM pg_roles WHERE rolname = current_user
  `;
  if (
    !identity ||
    identity.schema !== database.schemaName ||
    identity.role !== database.runtimeRoleName ||
    identity.privileged ||
    !identity.empty
  )
    throw new Error("Rehearsal requires the fresh, restricted wrapper schema");

  phase = "empty-schema-baseline";
  // Fixed object names only, after verifying the fresh generated schema and
  // its restricted owner. No original invariant/immutable-publication trigger
  // is removed. The runtime cannot alter any application or public schema.
  await prisma.$executeRawUnsafe(`DO $baseline$ BEGIN
    DROP TRIGGER event_publications_search_document ON event_publications;
    DROP TRIGGER event_publications_search_revision ON event_publications;
    DROP TRIGGER events_search_revision ON events;
    DROP TRIGGER users_search_revision ON users;
    DROP TRIGGER external_listings_search_revision ON external_listings;
    DROP TRIGGER source_records_search_revision ON listing_source_records;
    DROP TRIGGER event_locations_search_revision ON event_locations;
    DROP TRIGGER external_locations_search_revision ON external_listing_locations;
    DROP TABLE publication_search_documents;
    DROP TABLE public_search_revision;
    DROP FUNCTION derive_publication_search_document();
    DROP FUNCTION advance_public_search_revision();
    DROP INDEX event_locations_viewport_gix;
    DROP INDEX external_listing_locations_viewport_gix;
    DROP INDEX durable_jobs_runnable_queue_run_at_created_at_idx;
    DROP TABLE admin_mfa_recovery_codes;
    DROP TABLE admin_mfa_credentials;
    ALTER TABLE sessions DROP COLUMN mfa_authenticated_at,
      DROP COLUMN mfa_credential_version;
  END $baseline$;`);

  phase = "seed-existing-inventory";
  const fixture = await readFile(
    new URL("../tests/performance/seed-public-search.sql", import.meta.url),
    "utf8",
  );
  report.fixtureSha256 = createHash("sha256").update(fixture).digest("hex");
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('benchmark.users','100000',true),
        set_config('benchmark.listings','10000',true)`;
      for (const statement of fixture
        .split(/^-- @statement\r?$/m)
        .map((part) => part.trim())
        .filter(Boolean)) {
        await tx.$executeRawUnsafe(statement);
      }
      await tx.$executeRaw`INSERT INTO sessions
        (user_id, token_hash, expires_at, password_authenticated_at)
        VALUES (benchmark_id(1,1), repeat('c',64),
          CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP)`;
    },
    { timeout: 180_000, maxWait: 10_000 },
  );
  const before = await publicationFingerprint();
  const migrationResults = [];
  for (const migration of migrations) {
    phase = migration;
    const sql = await readFile(
      path.resolve("prisma/migrations", migration, "migration.sql"),
      "utf8",
    );
    if (sql.includes("$launch_rehearsal$"))
      throw new Error("Migration conflicts with the rehearsal delimiter");
    const started = performance.now();
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('statement_timeout','120000',true),
          set_config('lock_timeout','5000',true)`;
        await tx.$executeRawUnsafe(
          `DO $launch_rehearsal$ BEGIN\n${sql}\nEND $launch_rehearsal$;`,
        );
      },
      { timeout: 130_000, maxWait: 10_000 },
    );
    migrationResults.push({
      migration,
      sha256: createHash("sha256")
        .update(sql.replaceAll("\r\n", "\n"))
        .digest("hex"),
      wallMs: Number((performance.now() - started).toFixed(3)),
    });
  }
  report.migrations = migrationResults;
  phase = "verify-upgrade";
  const [evidence] = await prisma.$queryRaw<
    Array<{
      users: number;
      publications: number;
      documents: number;
      externalListings: number;
      mismatches: number;
      oldUnverifiedSessions: number;
      mfaCredentials: number;
      mfaCascadeForeignKeys: number;
      invalidIndexes: number;
    }>
  >(Prisma.sql`
    SELECT (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM event_publications) AS publications,
      (SELECT count(*)::int FROM publication_search_documents) AS documents,
      (SELECT count(*)::int FROM external_listings) AS "externalListings",
      (SELECT count(*)::int FROM event_publications p
        LEFT JOIN publication_search_documents d ON d.publication_id=p.id
        WHERE ROW(d.event_type,d.starts_at,d.ends_at,d.privacy_mode,d.city,d.region,d.public_id)
          IS DISTINCT FROM ROW((p.snapshot->'projection'->>'eventType')::event_type,
            (p.snapshot->'projection'->>'startsAt')::timestamptz,
            (p.snapshot->'projection'->>'endsAt')::timestamptz,
            (p.snapshot->>'privacyMode')::address_privacy_mode,
            p.snapshot->'projection'->'address'->>'city',
            p.snapshot->'projection'->'address'->>'region',p.public_id)) AS mismatches,
      (SELECT count(*)::int FROM sessions WHERE mfa_authenticated_at IS NULL
        AND mfa_credential_version IS NULL) AS "oldUnverifiedSessions",
      (SELECT count(*)::int FROM admin_mfa_credentials) AS "mfaCredentials",
      (SELECT count(*)::int FROM pg_constraint WHERE connamespace=current_schema()::regnamespace
        AND conrelid IN ('admin_mfa_credentials'::regclass,'admin_mfa_recovery_codes'::regclass)
        AND contype='f' AND confupdtype='c' AND confdeltype='c') AS "mfaCascadeForeignKeys",
      (SELECT count(*)::int FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
        WHERE c.relnamespace=current_schema()::regnamespace AND NOT i.indisvalid) AS "invalidIndexes"
  `);
  if (
    !evidence ||
    evidence.users !== 100_000 ||
    evidence.publications !== 5_000 ||
    evidence.documents !== 5_000 ||
    evidence.externalListings !== 5_000 ||
    evidence.mismatches !== 0 ||
    evidence.oldUnverifiedSessions !== 1 ||
    evidence.mfaCredentials !== 0 ||
    evidence.mfaCascadeForeignKeys !== 2 ||
    evidence.invalidIndexes !== 0 ||
    before !== (await publicationFingerprint())
  )
    throw new Error("Populated migration postconditions failed");
  report.evidence = evidence;
  report.publicationSnapshotsUnchanged = true;
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failedPhase = phase;
  report.error = redactTestDatabaseText(
    error instanceof Error ? error.message : "Unknown rehearsal failure",
    database,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  const directory = path.resolve("artifacts/performance");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `launch-migrations-${runId}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `Migration rehearsal ${String(report.status)}: ${file}\n`,
  );
}
