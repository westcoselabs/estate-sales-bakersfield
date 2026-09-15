import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createNeonAdapter } from "../../src/platform/database/neon-adapter";
import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";
import { seedSyntheticLaunchFixture } from "../../scripts/synthetic-launch-fixture";

test("bounded HTTP scale rehearsal with 100K synthetic accounts", async () => {
  const database = requireIsolatedTestDatabase();
  const prisma = new PrismaClient({
    adapter: createNeonAdapter(database.directUrl),
  });
  const anchor = new Date();
  // Include an ongoing sale even when this runs after local afternoon sales end.
  anchor.setUTCMinutes(0, 0, 0);
  const fixture = await seedSyntheticLaunchFixture(prisma, {
    users: 100_000,
    listings: 10_000,
    anchor,
  });
  // Bulk fixtures need current planner statistics, just like the SQL benchmark.
  // Never ANALYZE unrelated Development tables or the application schema.
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
  await prisma.$disconnect();
  const routes = [
    "/api/search?projection=list",
    "/api/search?projection=map",
    "/search",
    "/estate-sales",
    "/sales-today",
    "/yard-sales/this-weekend",
  ];
  type Sample = {
    route: string;
    ms: number;
    status: number;
    valid: boolean;
    bytes: number;
  };
  let sequence = 0;
  async function request(route: string): Promise<Sample> {
    const started = performance.now();
    try {
      // Separate synthetic visitors, only against this isolated localhost fixture.
      // The real SQL rate limiter still executes for every API request.
      const response = await fetch(`http://127.0.0.1:3417${route}`, {
        headers: { "user-agent": `esb-isolated-scale-${sequence++}` },
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      const body = await response.text();
      const api = route.startsWith("/api/");
      const parsed = api ? JSON.parse(body) : null;
      const valid =
        response.status === 200 &&
        (api
          ? parsed.schema === "public-search-v1" &&
            (route.includes("map")
              ? parsed.markers?.length > 0
              : parsed.items?.length > 0)
          : body.includes("Synthetic benchmark sale") &&
            !body.includes('id="__next_error__"'));
      return {
        route,
        ms: performance.now() - started,
        status: response.status,
        valid,
        bytes: Buffer.byteLength(body),
      };
    } catch {
      return {
        route,
        ms: performance.now() - started,
        status: 0,
        valid: false,
        bytes: 0,
      };
    }
  }
  function summarize(samples: Sample[]) {
    const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
    const percentile = (p: number) =>
      Math.round(
        latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)] ?? 0,
      );
    return {
      requests: samples.length,
      errors: samples.filter((s) => !s.valid).length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: Math.round(latencies.at(-1) ?? 0),
      bytes: samples.reduce((sum, s) => sum + s.bytes, 0),
      statuses: Object.fromEntries(
        [...new Set(samples.map((s) => s.status))].map((status) => [
          String(status),
          samples.filter((s) => s.status === status).length,
        ]),
      ),
    };
  }
  const warmup = await Promise.all(routes.map(request));
  const stages = [];
  for (const concurrency of [5, 20, 50, 100]) {
    const samples: Sample[] = [];
    const requests = Math.max(120, concurrency * 6);
    let issued = 0;
    const started = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (issued < requests) {
          const index = issued++;
          samples.push(await request(routes[index % routes.length]!));
        }
      }),
    );
    const elapsedMs = Math.round(performance.now() - started);
    const result = {
      concurrency,
      elapsedMs,
      requestsPerSecond: Math.round((requests / elapsedMs) * 100_000) / 100,
      ...summarize(samples),
      routes: routes.map((route) => ({
        route,
        ...summarize(samples.filter((s) => s.route === route)),
      })),
    };
    stages.push(result);
    console.log(
      JSON.stringify({
        concurrency,
        p95Ms: result.p95Ms,
        errors: result.errors,
        requestsPerSecond: result.requestsPerSecond,
      }),
    );
  }
  const report = {
    schema: "http-scale-rehearsal-v1",
    capturedAt: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
    workingTree: "uncommitted launch hardening",
    fixture,
    statistics: "Explicit ANALYZE of the 13 fixture tables before warmup",
    runtime: process.version,
    scope:
      "Local Next production build; APP_ENV=test bypasses shared application cache; real Development Neon; one server process; restricted DB role capped at 32 connections; closed-loop load; no CDN, browser assets, cold-start fleet or Production sizing validation",
    warmup: { ...summarize(warmup), routes: warmup },
    stages,
    provisionalBudget: { p95Ms: 1000, errorRate: 0.01 },
    status:
      stages.every((s) => s.errors / s.requests < 0.01 && s.p95Ms < 1000) &&
      warmup.every((s) => s.valid)
        ? "pass"
        : "capacity-review-required",
  };
  await mkdir("artifacts/performance", { recursive: true });
  const output = `artifacts/performance/http-scale-${process.env.TEST_RUN_ID}.json`;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`HTTP scale evidence: ${output}; ${report.status}`);
  expect(
    warmup.every((s) => s.valid),
    "All routes must return actual fixture results",
  ).toBe(true);
  expect(
    stages.every((s) => s.errors === 0),
    "Failed requests are a scale blocker; see saved evidence",
  ).toBe(true);
});
