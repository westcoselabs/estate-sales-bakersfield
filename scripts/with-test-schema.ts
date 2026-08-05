import { spawn, type ChildProcess } from "node:child_process";

import {
  createTestRunId,
  isolateDevelopmentDatabase,
  knownProductionDatabaseEnvironment,
  loadDevelopmentTestEnvironment,
  requireSafeDevelopmentDatabase,
} from "./test-database-safety";
import {
  createIsolatedTestSchema,
  deployTestMigrations,
  dropIsolatedTestSchema,
  testDatabaseEnvironment,
} from "./test-database-run";
import { runTestSchemaLifecycle } from "./test-schema-lifecycle";

function requestedCommand(argv: readonly string[]): readonly string[] {
  const separator = argv.indexOf("--");
  const command = separator >= 0 ? argv.slice(separator + 1) : argv;
  if (!command[0]) {
    throw new Error(
      "Usage: tsx scripts/with-test-schema.ts -- <command> [arguments]",
    );
  }
  return command;
}

function windowsCommandLine(command: readonly string[]): string {
  for (const argument of command) {
    if (!/^[A-Za-z0-9_./:@=+\\-]+$/.test(argument)) {
      throw new Error(
        "Windows test command arguments must use safe non-shell characters",
      );
    }
  }
  return command.join(" ");
}

function startCleanupWatchdog(
  database: ReturnType<typeof isolateDevelopmentDatabase>,
): ChildProcess {
  const knownProduction = knownProductionDatabaseEnvironment();
  const watchdog = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/test-schema-watchdog.ts"],
    {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: {
        NODE_ENV: "test",
        APP_ENV: "test",
        DATABASE_RESOURCE_ENV: "development",
        DEVELOPMENT_NEON_ENDPOINT_ID: database.endpointId,
        DEVELOPMENT_DATABASE_CONFIRMATION:
          process.env.DEVELOPMENT_DATABASE_CONFIRMATION,
        PRODUCTION_NEON_ENDPOINT_ID:
          process.env.PRODUCTION_NEON_ENDPOINT_ID ??
          knownProduction.PRODUCTION_NEON_ENDPOINT_ID,
        TEST_SCHEMA_WATCHDOG_SCHEMA: database.schemaName,
        TEST_SCHEMA_WATCHDOG_DIRECT_URL: database.baseDirectUrl,
        TEST_SCHEMA_WATCHDOG_PARENT_PID: String(process.pid),
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        ComSpec: process.env.ComSpec,
      },
    },
  );
  watchdog.unref();
  return watchdog;
}

function finishCleanupWatchdog(watchdog: ChildProcess): void {
  if (!watchdog.connected) return;
  watchdog.send("completed", () => {
    if (watchdog.connected) watchdog.disconnect();
  });
}

function runChild(
  command: readonly string[],
  environment: NodeJS.ProcessEnv,
  interruption: {
    child: ChildProcess | undefined;
    signal?: NodeJS.Signals;
  },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const child: ChildProcess = spawn(
      isWindows ? (process.env.ComSpec ?? "cmd.exe") : command[0]!,
      isWindows
        ? ["/d", "/s", "/c", windowsCommandLine(command)]
        : command.slice(1),
      {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
      },
    );
    interruption.child = child;
    if (interruption.signal && !child.killed) {
      child.kill(interruption.signal);
    }
    child.once("error", (error) => {
      interruption.child = undefined;
      reject(error);
    });
    child.once("close", (code) => {
      interruption.child = undefined;
      resolve(
        interruption.signal === "SIGINT"
          ? 130
          : interruption.signal === "SIGTERM"
            ? 143
            : (code ?? 1),
      );
    });
  });
}

async function main(): Promise<void> {
  const command = requestedCommand(process.argv.slice(2));
  loadDevelopmentTestEnvironment();
  const development = requireSafeDevelopmentDatabase({
    ...process.env,
    ...knownProductionDatabaseEnvironment(),
  });
  const runId = createTestRunId();
  const database = isolateDevelopmentDatabase(development, runId);
  const environment = testDatabaseEnvironment(database, runId);
  const watchdog = startCleanupWatchdog(database);
  let cleanupCompleted = false;
  const interruption: {
    child: ChildProcess | undefined;
    signal?: NodeJS.Signals;
  } = { child: undefined };
  const forwardSignal = (signal: NodeJS.Signals) => {
    interruption.signal = signal;
    if (interruption.child && !interruption.child.killed) {
      interruption.child.kill(signal);
    }
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    const exitCode = await runTestSchemaLifecycle({
      create: async () => {
        await createIsolatedTestSchema(database);
        process.stdout.write(
          `Prepared isolated test schema ${database.schemaName}.\n`,
        );
      },
      migrate: () => {
        if (!interruption.signal) deployTestMigrations(database, runId);
      },
      run: () =>
        interruption.signal
          ? Promise.resolve(interruption.signal === "SIGINT" ? 130 : 143)
          : runChild(command, environment, interruption),
      drop: async () => {
        await dropIsolatedTestSchema(database);
        cleanupCompleted = true;
        process.stdout.write(
          `Removed isolated test schema ${database.schemaName}.\n`,
        );
      },
    });
    process.exitCode = exitCode;
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    if (cleanupCompleted) finishCleanupWatchdog(watchdog);
    else if (watchdog.connected) watchdog.disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Test command failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
