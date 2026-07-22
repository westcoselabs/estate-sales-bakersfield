import { spawnSync } from "node:child_process";

function run(command: string, args: readonly string[]): void {
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/s", "/c", [command, ...args].join(" ")],
          {
            env: process.env,
            stdio: "inherit",
          },
        )
      : spawnSync(command, args, {
          env: process.env,
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

function applyPreviewMigrations(): void {
  if (process.env.APP_ENV !== "preview") return;

  if (process.env.DATABASE_RESOURCE_ENV !== "preview") {
    process.stderr.write(
      "BLOCKED: Preview migrations require DATABASE_RESOURCE_ENV=preview.\n",
    );
    process.exit(2);
  }
  const missing = ["DATABASE_URL", "DIRECT_URL"].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    process.stderr.write(
      `BLOCKED: Preview migrations require ${missing.join(", ")}.\n`,
    );
    process.exit(2);
  }

  runPnpm(["prisma", "migrate", "deploy"]);
  runPnpm(["exec", "tsx", "scripts/verify-preview-auth-rate-limit.ts"]);
}

applyPreviewMigrations();
runPnpm(["exec", "next", "build"]);
