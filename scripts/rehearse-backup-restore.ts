import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { createNeonAdapter } from "../src/platform/database/neon-adapter";
import {
  redactTestDatabaseText,
  requireIsolatedTestDatabase,
} from "./test-database-safety";
import { seedSyntheticLaunchFixture } from "./synthetic-launch-fixture";

if (process.argv.length !== 3 || process.argv[2] !== "--run")
  throw new Error("Run with --run through scripts/with-test-schema.ts");
const database = requireIsolatedTestDatabase();
const prisma = new PrismaClient({
  adapter: createNeonAdapter(database.directUrl),
});
const bin = process.env.PG_CLIENT_BIN;
if (!bin || !path.isAbsolute(bin))
  throw new Error(
    "PG_CLIENT_BIN must identify an absolute PostgreSQL client binary directory",
  );
const url = new URL(database.directUrl);
const directory = path.resolve(
  ".tmp",
  `backup-rehearsal-${database.schemaName}`,
);
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGSSLMODE: "require",
  PGOPTIONS: url.searchParams.get("options") ?? "",
  PGCONNECT_TIMEOUT: "10",
};
const executable = (name: string) =>
  path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
const report: Record<string, unknown> = {
  schema: "backup-restore-rehearsal-v1",
  capturedAt: new Date().toISOString(),
  scope:
    "Synthetic disposable Development schema; Production backup/restore is not verified",
  status: "failed",
};
async function fingerprints() {
  const tables = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT tablename::text AS name FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename`;
  const rows = [];
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table.name))
      throw new Error("Unexpected table identifier");
    const [value] = await prisma.$queryRawUnsafe<
      Array<{ count: string; digest: string }>
    >(
      `SELECT count(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(row)::text), '' ORDER BY md5(to_jsonb(row)::text)), '')) AS digest FROM "${database.schemaName}"."${table.name}" row`,
    );
    rows.push({ table: table.name, ...value });
  }
  return rows;
}
try {
  report.phase = "seed";
  await mkdir(directory, { recursive: true });
  report.fixture = await seedSyntheticLaunchFixture(prisma, {
    users: 1000,
    listings: 100,
    anchor: new Date("2030-05-01T15:00:00Z"),
  });
  report.phase = "fingerprint-source";
  const before = await fingerprints();
  const toolVersion = execFileSync(executable("pg_dump"), ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  report.toolVersion = toolVersion;
  const archive = path.join(directory, "synthetic.dump");
  report.phase = "dump";
  const start = performance.now();
  execFileSync(
    executable("pg_dump"),
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--schema=${database.schemaName}`,
      `--file=${archive}`,
    ],
    { env, windowsHide: true, timeout: 120_000, stdio: "pipe" },
  );
  report.dumpMs = Math.round(performance.now() - start);
  const toc = execFileSync(executable("pg_restore"), ["--list", archive], {
    env,
    windowsHide: true,
    encoding: "utf8",
  });
  // Keep the already-created schema container: the test login cannot create schemas.
  // Everything inside this verified disposable schema is rebuilt by pg_restore.
  const filtered = toc
    .split(/\r?\n/)
    .filter((line) => !/\bSCHEMA - /.test(line))
    .join("\n");
  const listFile = path.join(directory, "restore.list");
  await writeFile(listFile, filtered);
  report.phase = "restore";
  const restoreStart = performance.now();
  execFileSync(
    executable("pg_restore"),
    [
      "--clean",
      "--if-exists",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      `--use-list=${listFile}`,
      `--dbname=${env.PGDATABASE}`,
      archive,
    ],
    { env, windowsHide: true, timeout: 120_000, stdio: "pipe" },
  );
  report.restoreMs = Math.round(performance.now() - restoreStart);
  report.phase = "verify";
  const after = await fingerprints();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Restored table contents differ from archive source");
  report.tablesVerified = before.length;
  report.rowsVerified = before.reduce(
    (sum, table) => sum + Number(table.count),
    0,
  );
  report.archiveBytes = (await readFile(archive)).byteLength;
  report.status = "pass";
} catch (error) {
  const failure = error as Error & { stderr?: Buffer };
  report.diagnostic = redactTestDatabaseText(
    failure.stderr?.toString() || failure.message || "Unknown failure",
    database,
  ).slice(0, 2000);
  report.failure =
    "Backup/restore rehearsal failed. Raw command output is withheld because it can contain connection details.";
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await mkdir("artifacts/operations", { recursive: true });
  const output = `artifacts/operations/backup-restore-${process.env.TEST_RUN_ID}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ report: output, ...report }, null, 2));
}
