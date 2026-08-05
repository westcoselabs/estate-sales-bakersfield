import { spawnSync } from "node:child_process";

import { prepareLocalRuntimeEnvironment } from "./local-runtime-environment";
import { verifySharpRuntimeTrace } from "./verify-sharp-runtime-trace";

const buildEnvironment =
  process.env.VERCEL_ENV === "production"
    ? process.env
    : prepareLocalRuntimeEnvironment("production");

function run(command: string, args: readonly string[]): void {
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/s", "/c", [command, ...args].join(" ")],
          {
            env: buildEnvironment,
            stdio: "inherit",
          },
        )
      : spawnSync(command, args, {
          env: buildEnvironment,
          stdio: "inherit",
        });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPnpm(args: readonly string[]): void {
  run("pnpm", args);
}

runPnpm(["exec", "next", "build"]);
verifySharpRuntimeTrace();
process.stdout.write("Verified the photo finalizer native runtime trace.\n");
