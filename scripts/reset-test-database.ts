import { spawnSync } from "node:child_process";

import {
  loadDedicatedTestEnvironment,
  redactTestDatabaseText,
  requireDestructiveTestReset,
} from "./test-database-safety";
import { testDatabaseEnvironment } from "./test-database-run";

loadDedicatedTestEnvironment();

try {
  const database = requireDestructiveTestReset();
  const isWindows = process.platform === "win32";
  const result = spawnSync(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows
      ? [
          "/d",
          "/s",
          "/c",
          "pnpm exec prisma migrate reset --force --skip-generate",
        ]
      : ["exec", "prisma", "migrate", "reset", "--force", "--skip-generate"],
    {
      cwd: process.cwd(),
      env: testDatabaseEnvironment(database, "testrun-reset-explicit"),
      encoding: "utf8",
    },
  );
  const output = redactTestDatabaseText(
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    database,
  );
  if (output) process.stdout.write(`${output}\n`);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Test database reset was rejected"}\n`,
  );
  process.exitCode = 2;
}
