import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import type { PublicSearchRepository } from "../src/modules/public-search/application/ports";
import { PrismaPublicSearchRepository } from "../src/modules/public-search/infrastructure/prisma-public-search-repository";
import { createNeonAdapter } from "../src/platform/database/neon-adapter";
import {
  redactTestDatabaseText,
  requireIsolatedTestDatabase,
} from "./test-database-safety";

const args = process.argv.slice(2);
if (
  !args.includes("--run") ||
  args.some((arg) => !["--run", "--smoke"].includes(arg)) ||
  new Set(args).size !== args.length
) {
  throw new Error(
    "Opt-in benchmark: with-test-schema.ts -- node --conditions=react-server --import tsx scripts/benchmark-public-search.ts --run [--smoke]",
  );
}
// This rejects Production, unscoped URLs, shared owner credentials, and
// mismatched test roles before opening a connection or writing fixture rows.
const database = requireIsolatedTestDatabase();
if (!/^testrun-[a-z0-9-]+$/.test(process.env.TEST_RUN_ID ?? ""))
  throw new Error("A generated TEST_RUN_ID is required");
const smoke = args.includes("--smoke");
const users = smoke ? 1_000 : 100_000;
const listings = smoke ? 100 : 10_000;
const samples = smoke ? 25 : 100;
const prisma = new PrismaClient({
  adapter: createNeonAdapter(database.pooledUrl),
});
const captured = new Map<string, Prisma.Sql>();
let captureCase: string | null = null;
const repository = new PrismaPublicSearchRepository({
  $queryRaw: (query: Prisma.Sql) => {
    if (captureCase) captured.set(captureCase, query);
    return prisma.$queryRaw(query);
  },
} as unknown as PrismaClient);

type SearchInput = Parameters<PublicSearchRepository["search"]>[0];
const anchor = new Date("2030-05-01T15:00:00.000Z");
const base: SearchInput = {
  eventType: null,
  location: { city: "Bakersfield", region: "CA" },
  activeAfter: anchor,
  range: null,
  cursor: null,
  limit: 25,
  bounds: null,
};
const cases: ReadonlyArray<{ name: string; input: SearchInput }> = [
  { name: "all-first-page", input: base },
  { name: "estate-first-page", input: { ...base, eventType: "ESTATE_SALE" } },
  {
    name: "next-seven-days",
    input: {
      ...base,
      range: {
        startsAt: anchor,
        endsAt: new Date(anchor.getTime() + 7 * 86400_000),
      },
    },
  },
  {
    name: "map-city-bounds",
    input: {
      ...base,
      bounds: { west: -119.4, east: -118.65, south: 35.1, north: 35.74 },
    },
  },
  {
    name: "map-tight-bounds",
    input: {
      ...base,
      bounds: { west: -119.15, east: -119.1, south: 35.3, north: 35.35 },
    },
  },
  {
    name: "cursor-later-page",
    input: {
      ...base,
      cursor: {
        startsAt: new Date("2030-05-16T15:00:00.000Z"),
        sourceKind: "ORGANIZER",
        publicId: "000000000001",
      },
    },
  },
];

function rounded(value: number): number {
  return Number(value.toFixed(3));
}
function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
}

async function measure(input: SearchInput, concurrency: number) {
  const durations: number[] = [];
  let next = 0;
  let failures = 0;
  let minimumRows = 25;
  let maximumRows = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, samples) }, async () => {
      while (next < samples) {
        next += 1;
        const before = performance.now();
        try {
          const result = await repository.search(input);
          minimumRows = Math.min(minimumRows, result.length);
          maximumRows = Math.max(maximumRows, result.length);
          if (result.length > 25)
            throw new Error("Unbounded benchmark search result");
        } catch {
          failures += 1;
        }
        durations.push(performance.now() - before);
      }
    }),
  );
  const elapsed = performance.now() - started;
  durations.sort((left, right) => left - right);
  return {
    concurrency,
    samples,
    failures,
    minimumRows,
    maximumRows,
    p50Ms: rounded(percentile(durations, 0.5)),
    p95Ms: rounded(percentile(durations, 0.95)),
    maxMs: rounded(durations.at(-1) ?? 0),
    elapsedMs: rounded(elapsed),
    successfulQueriesPerSecond: rounded(
      ((samples - failures) * 1000) / elapsed,
    ),
  };
}

const report: Record<string, unknown> = {
  schema: "public-search-benchmark-v1",
  capturedAt: new Date().toISOString(),
  fixtureVersion: "v1",
  mode: smoke ? "smoke" : "full",
  users,
  listings,
  organizerPublications: listings / 2,
  externalListings: listings / 2,
  anchor: anchor.toISOString(),
  runtime: process.version,
  limitations: [
    "Synthetic test-schema database benchmark; not a production or HTTP load test.",
    "100K stored user records are not 100K concurrent users; measured concurrency is 1, 10 and 25 queries.",
    "Durable constraints/triggers remain enabled. Synthetic payment/photo records do not call Stripe or Blob.",
    "Client-observed latency includes network, adapter pool wait and repository row mapping; EXPLAIN execution times isolate server work.",
    "One process and its configured connection pool are measured. No distributed application instances, CDN/media traffic or live provider traffic.",
    "Warm-cache measurements follow explicit ANALYZE and warmup queries; cold start and production hardware/plan capacity are not established.",
    "Fixture values are deterministic, including privacy/location/date selectivity; real inventory distributions can differ.",
  ],
};
let phase = "runtime-guard";
try {
  report.commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  report.workingTreeModified = Boolean(
    execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
  );
  const [identity] = await prisma.$queryRaw<
    Array<{
      schema: string;
      role: string;
      superuser: boolean;
      createRole: boolean;
    }>
  >(Prisma.sql`
    SELECT current_schema()::text AS schema, current_user::text AS role, rolsuper AS superuser, rolcreaterole AS "createRole"
    FROM pg_catalog.pg_roles WHERE rolname=current_user
  `);
  if (
    !identity ||
    identity.schema !== database.schemaName ||
    identity.role !== database.runtimeRoleName ||
    identity.superuser ||
    identity.createRole
  ) {
    throw new Error(
      "Benchmark runtime is not the generated restricted schema owner",
    );
  }
  if (
    (await prisma.user.count()) !== 0 ||
    (await prisma.event.count()) !== 0 ||
    (await prisma.externalListing.count()) !== 0
  ) {
    throw new Error("Benchmark requires a fresh empty test schema");
  }
  phase = "bulk-seed";
  const seedStarted = performance.now();
  const sql = await readFile(
    new URL("../tests/performance/seed-public-search.sql", import.meta.url),
    "utf8",
  );
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT set_config('benchmark.users',${String(users)},true), set_config('benchmark.listings',${String(listings)},true)`,
      );
      for (const statement of sql
        .split(/^-- @statement\r?$/m)
        .map((part) => part.trim())
        .filter(Boolean)) {
        // The only unsafe SQL is this checked-in constant fixture file. Runtime
        // counts use set_config parameters and no caller-supplied SQL is accepted.
        await tx.$executeRawUnsafe(statement);
      }
    },
    { timeout: 180_000, maxWait: 10_000 },
  );
  report.seedMs = rounded(performance.now() - seedStarted);
  const actualCounts = {
    users: await prisma.user.count(),
    organizerPublications: await prisma.eventPublication.count(),
    externalListings: await prisma.externalListing.count(),
  };
  if (
    actualCounts.users !== users ||
    actualCounts.organizerPublications !== listings / 2 ||
    actualCounts.externalListings !== listings / 2
  ) {
    throw new Error(
      "The seeded benchmark row counts do not match the requested fixture",
    );
  }
  report.actualCounts = actualCounts;
  report.seedSha256 = createHash("sha256").update(sql).digest("hex");
  report.repositorySha256 = createHash("sha256")
    .update(
      await readFile(
        new URL(
          "../src/modules/public-search/infrastructure/prisma-public-search-repository.ts",
          import.meta.url,
        ),
      ),
    )
    .digest("hex");
  phase = "analyze";
  // Fixed identifiers only. Restrict statistics updates to this owned schema's
  // benchmark tables rather than ANALYZE over unrelated Development objects.
  for (const table of [
    "users",
    "organizer_profiles",
    "events",
    "event_locations",
    "event_photos",
    "event_approvals",
    "payment_attempts",
    "event_publications",
    "publication_search_documents",
    "external_listings",
    "external_listing_locations",
    "listing_source_records",
    "listing_import_candidates",
  ]) {
    await prisma.$executeRawUnsafe(
      `ANALYZE "${database.schemaName}"."${table}"`,
    );
  }
  const results = [];
  for (const scenario of cases) {
    phase = scenario.name;
    captureCase = scenario.name;
    const first = await repository.search(scenario.input);
    captureCase = null;
    if (!first.length && scenario.name !== "map-tight-bounds")
      throw new Error("Benchmark fixture unexpectedly returned no results");
    const query = captured.get(scenario.name);
    if (!query) throw new Error("The actual repository SQL was not captured");
    const plan = await prisma.$queryRaw(
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
    );
    for (let warmup = 0; warmup < 3; warmup++)
      await repository.search(scenario.input);
    const measurements = [];
    for (const concurrency of [1, 10, 25])
      measurements.push(await measure(scenario.input, concurrency));
    results.push({
      name: scenario.name,
      firstResultRows: first.length,
      plan,
      measurements,
    });
    process.stdout.write(`${scenario.name}: completed concurrency 1/10/25\n`);
  }
  report.results = results;
  report.status = results.some((result) =>
    result.measurements.some((item) => item.failures > 0),
  )
    ? "failed"
    : "complete";
  if (report.status === "failed") process.exitCode = 1;
} catch (error) {
  report.status = "failed";
  report.failedPhase = phase;
  report.error = redactTestDatabaseText(
    error instanceof Error ? error.message : "Unknown benchmark failure",
    database,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  const directory = path.resolve("artifacts/performance");
  await mkdir(directory, { recursive: true });
  const file = path.join(
    directory,
    `public-search-${process.env.TEST_RUN_ID}.json`,
  );
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Benchmark ${String(report.status)}. Report: ${file}\n`);
}
