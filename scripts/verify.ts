import { spawnSync } from "node:child_process";

import {
  knownProductionDatabaseEnvironment,
  loadDevelopmentTestEnvironment,
  requireSafeDevelopmentDatabase,
} from "./test-database-safety";

const mode = process.argv[2];
const isWindows = process.platform === "win32";

function run(command: string): number {
  process.stdout.write(`\n==> pnpm ${command}\n`);
  const result = spawnSync(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows ? ["/d", "/s", "/c", `pnpm ${command}`] : command.split(" "),
    {
      stdio: "inherit",
      env: process.env,
    },
  );
  return result.status ?? 1;
}

const credentialFreeCommands = [
  "format:check",
  "lint",
  "arch:check",
  "typecheck",
  "prisma:validate",
  "audit:prod",
  "test:unit:coverage",
  "test:contract:blob",
  "test:contract:email",
  "test:contract:location",
  "test:contract:image",
  "test:contract:stripe",
] as const;

function runCredentialFreeChecks(): boolean {
  let failed = false;
  for (const command of credentialFreeCommands) {
    const status = run(command);
    if (status !== 0) failed = true;
  }
  return failed;
}

if (mode === "credential-free") {
  process.exitCode = runCredentialFreeChecks() ? 1 : 0;
} else if (mode === "offline") {
  let failed = runCredentialFreeChecks();
  let testDatabaseReady = false;
  try {
    loadDevelopmentTestEnvironment();
    requireSafeDevelopmentDatabase({
      ...process.env,
      ...knownProductionDatabaseEnvironment(),
    });
    testDatabaseReady = true;
  } catch (error) {
    process.stderr.write(
      `BLOCKED: ${error instanceof Error ? error.message : "Development Neon is unavailable"}\n`,
    );
  }
  const blocked = !testDatabaseReady;
  if (testDatabaseReady) {
    for (const command of ["build", "test:integration", "test:e2e"]) {
      if (run(command) !== 0) failed = true;
    }
  } else {
    process.stderr.write(
      "BLOCKED: integration and Playwright checks require guarded Development Neon test schemas.\n",
    );
  }
  process.exitCode = failed ? 1 : blocked ? 2 : 0;
} else {
  process.stderr.write(
    "Usage: tsx scripts/verify.ts <credential-free|offline>\n",
  );
  process.exitCode = 1;
}
