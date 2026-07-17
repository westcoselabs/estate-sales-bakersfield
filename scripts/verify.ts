import { spawnSync } from "node:child_process";

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

if (mode === "offline") {
  for (const command of [
    "format:check",
    "lint",
    "arch:check",
    "typecheck",
    "prisma:validate",
    "audit:prod",
    "test:unit",
    "test:contract:blob",
    "test:integration",
    "build",
    "test:e2e",
  ]) {
    const status = run(command);
    if (status !== 0) process.exit(status);
  }
} else if (mode === "live") {
  if (process.env.APP_ENV === "production") {
    process.stderr.write(
      "BLOCKED: verify:live may not target APP_ENV=production.\n",
    );
    process.exitCode = 2;
  } else {
    let blocked = false;
    let failed = false;
    const checks: ReadonlyArray<{
      command: string;
      required: readonly string[];
    }> = [
      {
        command: "db:migrate:deploy",
        required: ["DATABASE_URL", "DIRECT_URL"],
      },
      { command: "db:verify:live", required: ["DATABASE_URL", "DIRECT_URL"] },
      {
        command: "auth:benchmark:vercel",
        required: ["VERCEL_BENCHMARK_URL", "CRON_SECRET"],
      },
      {
        command: "test:contract:blob:live",
        required: ["BLOB_READ_WRITE_TOKEN"],
      },
    ];

    for (const check of checks) {
      const missing = check.required.filter((name) => !process.env[name]);
      if (missing.length > 0) {
        blocked = true;
        process.stderr.write(
          `BLOCKED: pnpm ${check.command} requires ${missing.join(", ")}.\n`,
        );
        continue;
      }
      const status = run(check.command);
      if (status === 2) blocked = true;
      else if (status !== 0) failed = true;
    }

    process.exitCode = failed ? 1 : blocked ? 2 : 0;
  }
} else {
  process.stderr.write("Usage: tsx scripts/verify.ts <offline|live>\n");
  process.exitCode = 1;
}
