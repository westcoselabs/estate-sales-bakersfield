import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

const port = 3417;
const capturePath = path.resolve(".tmp/e2e-auth-emails.jsonl");
let container: StartedTestContainer | undefined;
let application: ChildProcess | undefined;
let stopping = false;

async function stop(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  application?.kill();
  if (container) await container.stop().catch(() => undefined);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  await mkdir(path.dirname(capturePath), { recursive: true });
  await rm(capturePath, { force: true });

  try {
    container = await new GenericContainer("postgis/postgis:16-3.5-alpine")
      .withEnvironment({
        POSTGRES_DB: "estate_sales_test",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_USER: "postgres",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(
          /database system is ready to accept connections/i,
          2,
        ),
      )
      .withStartupTimeout(120_000)
      .start();
  } catch (cause) {
    throw new Error(
      "BLOCKED_LOCAL_PREREQUISITE: Playwright authentication tests require a working Docker-compatible container runtime",
      { cause },
    );
  }

  const databaseUrl =
    `postgresql://postgres:postgres@${container.getHost()}:` +
    `${String(container.getMappedPort(5432))}/estate_sales_test`;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    APP_ENV: "test",
    APP_URL: `http://127.0.0.1:${String(port)}`,
    DATABASE_DRIVER: "pg",
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    LOG_LEVEL: "silent",
    AUTH_FINGERPRINT_SECRET: "phase-two-e2e-fingerprint-secret-32-characters",
    AUTH_EMAIL_CAPTURE_PATH: capturePath,
  };
  const isWindows = process.platform === "win32";
  const migration = spawnSync(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows
      ? ["/d", "/s", "/c", "pnpm exec prisma migrate deploy"]
      : ["exec", "prisma", "migrate", "deploy"],
    { cwd: process.cwd(), env: environment, stdio: "inherit" },
  );
  if (migration.status !== 0) {
    throw new Error("Fresh E2E migration failed");
  }

  const child = spawn(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows
      ? ["/d", "/s", "/c", `pnpm exec next start -p ${String(port)}`]
      : ["exec", "next", "start", "-p", String(port)],
    { cwd: process.cwd(), env: environment, stdio: "inherit" },
  );
  application = child;
  child.on("exit", (code) => void stop(code ?? 1));
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
