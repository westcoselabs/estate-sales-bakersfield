import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const target = process.env.VERCEL_BENCHMARK_URL;
const secret = process.env.CRON_SECRET;

export {};

interface BenchmarkResult {
  readonly p50Ms?: number;
  readonly p95Ms?: number;
  readonly error?: string;
}

function parseBenchmarkResult(body: string): BenchmarkResult | undefined {
  try {
    return JSON.parse(body) as BenchmarkResult;
  } catch {
    return undefined;
  }
}

function requestThroughVercelCli(
  endpoint: URL,
  bearerSecret: string,
): BenchmarkResult {
  const deployment = endpoint.host;
  const path = `${endpoint.pathname}${endpoint.search}`;
  const command = process.platform === "win32" ? process.execPath : "npx";
  const arguments_ = [
    ...(process.platform === "win32"
      ? [
          join(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npx-cli.js",
          ),
        ]
      : []),
    "vercel",
    "curl",
    path,
    "--deployment",
    deployment,
    "--yes",
    "--",
    "--request",
    "POST",
    "--variable",
    "%CRON_SECRET",
    "--expand-header",
    "authorization: Bearer {{CRON_SECRET}}",
    "--silent",
    "--show-error",
  ];
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    env: { ...process.env, CRON_SECRET: bearerSecret },
  });

  if (result.status !== 0) {
    throw new Error(
      "Vercel CLI could not access the protected Preview deployment.",
    );
  }

  const body = parseBenchmarkResult(result.stdout.trim());
  if (!body) {
    throw new Error(
      "Vercel CLI returned a non-JSON response from the Argon2 benchmark.",
    );
  }
  return body;
}

if (!target || !secret) {
  process.stderr.write(
    "BLOCKED: VERCEL_BENCHMARK_URL and CRON_SECRET are required.\n",
  );
  process.exitCode = 2;
} else {
  const endpoint = new URL("/api/internal/benchmarks/argon2", target);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const responseText = await response.text();
  const directBody = parseBenchmarkResult(responseText);
  const usedVercelCli =
    !directBody &&
    Boolean(response.headers.get("content-type")?.includes("text/html"));
  const body =
    directBody ??
    (usedVercelCli ? requestThroughVercelCli(endpoint, secret) : undefined);
  if (
    (!usedVercelCli && !response.ok) ||
    !body ||
    typeof body.p50Ms !== "number" ||
    typeof body.p95Ms !== "number"
  ) {
    throw new Error(
      `Vercel Argon2 benchmark failed (${usedVercelCli ? "CLI" : String(response.status)}): ${body?.error ?? "invalid response"}`,
    );
  }
  const output = `${JSON.stringify(body)}\n`;
  if (usedVercelCli) process.stderr.write(output);
  else process.stdout.write(output);
  if (body.p50Ms < 150 || body.p50Ms > 500 || body.p95Ms > 750) {
    throw new Error(
      `Argon2 runtime is outside the validation envelope (p50=${String(body.p50Ms)}ms, p95=${String(body.p95Ms)}ms)`,
    );
  }
}
