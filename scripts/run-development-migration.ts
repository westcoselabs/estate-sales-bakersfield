import { spawnSync } from "node:child_process";

import {
  knownProductionDatabaseEnvironment,
  loadLocalDevelopmentEnvironment,
  requireSafeDevelopmentDatabase,
} from "./test-database-safety";

function migrationArguments(input: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const argument = input[index];
    if (argument === "--create-only") {
      result.push(argument);
      continue;
    }
    if (argument === "--name") {
      const name = input[index + 1];
      if (!name || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(name)) {
        throw new Error("Migration names must be lowercase safe identifiers");
      }
      result.push(argument, name);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported migration argument: ${argument ?? ""}`);
  }
  return result;
}

loadLocalDevelopmentEnvironment();
if (process.env.APP_ENV !== "local") {
  throw new Error("Development migrations require APP_ENV=local");
}
const database = requireSafeDevelopmentDatabase({
  ...process.env,
  ...knownProductionDatabaseEnvironment(),
});
const args = migrationArguments(process.argv.slice(2));
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  APP_ENV: "local",
  DATABASE_URL: database.basePooledUrl,
  DIRECT_URL: database.baseDirectUrl,
  DATABASE_RESOURCE_ENV: "development",
};
for (const name of Object.keys(environment)) {
  if (name.startsWith("PRODUCTION_") || name.startsWith("PREVIEW_")) {
    delete environment[name];
  }
}

const isWindows = process.platform === "win32";
const result = spawnSync(
  isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
  isWindows
    ? ["/d", "/s", "/c", ["pnpm exec prisma migrate dev", ...args].join(" ")]
    : ["exec", "prisma", "migrate", "dev", ...args],
  { cwd: process.cwd(), env: environment, stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
