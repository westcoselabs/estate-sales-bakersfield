import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  loadDedicatedTestEnvironment,
  redactTestDatabaseText,
  requireSafeTestDatabase,
} from "./test-database-safety";
import {
  cleanupTestRun,
  deployTestMigrations,
  testDatabaseEnvironment,
} from "./test-database-run";

const port = 3417;
const capturePath = path.resolve(".tmp/e2e-auth-emails.jsonl");
let application: ChildProcess | undefined;
let stopping = false;

loadDedicatedTestEnvironment();
const database = requireSafeTestDatabase();
const configuredRunId = process.env.TEST_RUN_ID;
if (!configuredRunId || !/^testrun-[a-z0-9-]+$/.test(configuredRunId)) {
  throw new Error("Playwright requires a valid TEST_RUN_ID");
}
const runId: string = configuredRunId;

async function stop(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  application?.kill();
  await cleanupTestRun(database, runId).catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Test-run cleanup failed",
    );
  });
  process.exit(exitCode);
}

async function main(): Promise<void> {
  await mkdir(path.dirname(capturePath), { recursive: true });
  await rm(capturePath, { force: true });
  deployTestMigrations(database, runId);

  const environment: NodeJS.ProcessEnv = {
    ...testDatabaseEnvironment(database, runId),
    NODE_ENV: "production",
    APP_URL: `http://127.0.0.1:${String(port)}`,
    LOG_LEVEL: "silent",
    AUTH_FINGERPRINT_SECRET: "phase-three-e2e-fingerprint-secret-32-characters",
    AUTH_EMAIL_CAPTURE_PATH: capturePath,
    TEST_MEDIA_ROOT: path.resolve(`.tmp/e2e-media/${runId}`),
    TEST_MEDIA_SIGNING_SECRET:
      "phase-three-e2e-media-signing-secret-32-characters",
    TEST_LOCATION_FIXTURES: "bakersfield",
  };
  const isWindows = process.platform === "win32";
  const build = spawnSync(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows
      ? ["/d", "/s", "/c", "pnpm exec next build"]
      : ["exec", "next", "build"],
    {
      cwd: process.cwd(),
      env: environment,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const buildOutput = redactTestDatabaseText(
    `${build.stdout ?? ""}\n${build.stderr ?? ""}`.trim(),
    database,
  );
  if (buildOutput) process.stdout.write(`${buildOutput}\n`);
  if (build.status !== 0) {
    throw new Error(
      `The isolated Test application build failed with exit code ${String(build.status)}`,
    );
  }
  application = spawn(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows
      ? ["/d", "/s", "/c", `pnpm exec next start -p ${String(port)}`]
      : ["exec", "next", "start", "-p", String(port)],
    { cwd: process.cwd(), env: environment, stdio: "inherit" },
  );
  application.on("exit", (code) => void stop(code ?? 1));
}

process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));
process.on("uncaughtException", (error) => {
  console.error(error instanceof Error ? error.message : "E2E server failed");
  void stop(1);
});
process.on("unhandledRejection", (error) => {
  console.error(error instanceof Error ? error.message : "E2E server failed");
  void stop(1);
});

void main();
