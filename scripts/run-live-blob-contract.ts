import { spawnSync } from "node:child_process";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  process.stderr.write(
    "BLOCKED: BLOB_READ_WRITE_TOKEN is required for the live Blob contract.\n",
  );
  process.exitCode = 2;
} else if (process.env.APP_ENV === "production") {
  process.stderr.write(
    "BLOCKED: live Blob contracts may not run with APP_ENV=production.\n",
  );
  process.exitCode = 2;
} else {
  const isWindows = process.platform === "win32";
  const result = spawnSync(
    isWindows ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
    isWindows
      ? ["/d", "/s", "/c", "pnpm exec vitest run --project blob-live"]
      : ["exec", "vitest", "run", "--project", "blob-live"],
    {
      env: { ...process.env, APP_ENV: process.env.APP_ENV ?? "test" },
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
}
