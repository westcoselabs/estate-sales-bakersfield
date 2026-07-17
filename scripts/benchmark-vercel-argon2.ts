const target = process.env.VERCEL_BENCHMARK_URL;
const secret = process.env.CRON_SECRET;

export {};

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
  const body = (await response.json()) as {
    p50Ms?: number;
    p95Ms?: number;
    error?: string;
  };
  if (
    !response.ok ||
    typeof body.p50Ms !== "number" ||
    typeof body.p95Ms !== "number"
  ) {
    throw new Error(
      `Vercel Argon2 benchmark failed (${String(response.status)}): ${JSON.stringify(body)}`,
    );
  }
  process.stdout.write(`${JSON.stringify(body)}\n`);
  if (body.p50Ms < 150 || body.p50Ms > 500 || body.p95Ms > 750) {
    throw new Error(
      `Argon2 runtime is outside the validation envelope (p50=${String(body.p50Ms)}ms, p95=${String(body.p95Ms)}ms)`,
    );
  }
}
