import { spawnSync } from "node:child_process";

import { prepareLocalRuntimeEnvironment } from "./local-runtime-environment";

const command = process.argv[2];
if (command !== "dev" && command !== "start") {
  throw new Error("Usage: tsx scripts/run-local-next.ts <dev|start>");
}
const environment = prepareLocalRuntimeEnvironment(
  command === "dev" ? "development" : "production",
);
const isWindows = process.platform === "win32";
const result = spawnSync(
  isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
  isWindows
    ? ["/d", "/s", "/c", `pnpm exec next ${command}`]
    : ["exec", "next", command],
  { cwd: process.cwd(), env: environment, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
