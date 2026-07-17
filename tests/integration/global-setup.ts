import { spawnSync } from "node:child_process";

import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import type { TestProject } from "vitest/node";

const POSTGIS_IMAGE = "postgis/postgis:16-3.5-alpine";

interface IntegrationDatabase {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

function localDatabaseFromEnvironment(): IntegrationDatabase | null {
  const configured = process.env.INTEGRATION_DATABASE_URL;
  if (!configured) return null;

  const url = new URL(configured);
  if (
    url.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    url.pathname !== "/estate_sales_test"
  ) {
    throw new Error(
      "INTEGRATION_DATABASE_URL is permitted only for a localhost database named estate_sales_test",
    );
  }
  return { url: configured, stop: () => Promise.resolve() };
}

async function startContainerDatabase(): Promise<IntegrationDatabase> {
  let container: StartedTestContainer;
  try {
    container = await new GenericContainer(POSTGIS_IMAGE)
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
      "BLOCKED_LOCAL_PREREQUISITE: the credential-free integration suite requires a working Docker-compatible container runtime",
      { cause },
    );
  }

  return {
    url: `postgresql://postgres:postgres@${container.getHost()}:${String(
      container.getMappedPort(5432),
    )}/estate_sales_test`,
    stop: async () => container.stop().then(() => undefined),
  };
}

export default async function setup(project: TestProject) {
  const database =
    localDatabaseFromEnvironment() ?? (await startContainerDatabase());

  try {
    const isWindows = process.platform === "win32";
    const executable = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
    const args = isWindows
      ? ["/d", "/s", "/c", "pnpm exec prisma migrate deploy"]
      : ["exec", "prisma", "migrate", "deploy"];
    const migration = spawnSync(executable, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_ENV: "test",
        DATABASE_DRIVER: "pg",
        DATABASE_URL: database.url,
        DIRECT_URL: database.url,
      },
      encoding: "utf8",
    });
    if (migration.status !== 0) {
      throw new Error(
        `Fresh migration failed.\n${migration.stdout ?? ""}\n${migration.stderr ?? ""}\n${migration.error?.message ?? ""}`,
      );
    }
    project.provide("databaseUrl", database.url);
  } catch (error) {
    await database.stop();
    throw error;
  }

  return database.stop;
}
