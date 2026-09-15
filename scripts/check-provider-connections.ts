import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { list } from "@vercel/blob";

const args = process.argv.slice(2);
const file = args.find((value) => value.startsWith("--env-file="))?.slice(11);
if (
  args.length !== 2 ||
  !args.includes("--run") ||
  !file ||
  ![".env", ".env.local"].includes(file)
) {
  throw new Error(
    "Usage: tsx scripts/check-provider-connections.ts --run --env-file=.env.local|.env",
  );
}
const environment = parse(await readFile(file, "utf8"));
type Check = {
  name: string;
  status: "pass" | "fail" | "blocked";
  detail: string;
};
const checks: Check[] = [];
class ProbeBlockedError extends Error {}
async function check(
  name: string,
  fields: string[],
  action: () => Promise<string>,
) {
  const missing = fields.filter((field) => !environment[field]);
  if (missing.length) {
    checks.push({
      name,
      status: "blocked",
      detail: `Missing: ${missing.join(", ")}`,
    });
    return;
  }
  try {
    checks.push({ name, status: "pass", detail: await action() });
  } catch (error) {
    checks.push({
      name,
      status: error instanceof ProbeBlockedError ? "blocked" : "fail",
      detail:
        error instanceof ProbeBlockedError
          ? error.message
          : "Connection or provider validation failed; provider messages and credentials omitted.",
    });
  }
}
async function json(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    ...(headers ? { headers } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (
      url === "https://api.resend.com/domains" &&
      body.name === "restricted_api_key"
    )
      throw new ProbeBlockedError(
        "Sending-only key cannot inspect domains. Keep least-privilege key; verify sender DNS and inbox delivery in Resend separately.",
      );
    throw new Error("Provider request rejected");
  }
  return response.json();
}
await check("database", ["DIRECT_URL"], async () => {
  const sql = neon(environment.DIRECT_URL!);
  const [row] =
    await sql`SELECT current_setting('server_version_num') AS version, EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') AS postgis`;
  if (!row?.postgis) throw new Error("PostGIS unavailable");
  return `Connection and PostGIS available; PostgreSQL ${String(row.version)}.`;
});
await check("private-blob-token", ["BLOB_READ_WRITE_TOKEN"], async () => {
  // Inspect only the reserved probe prefix; never enumerate unrelated objects.
  await list({
    token: environment.BLOB_READ_WRITE_TOKEN!,
    prefix: "__esb_healthcheck__/",
    limit: 1,
  });
  return "Token accepted for reserved-prefix read. Upload/private-delivery smoke remains separate.";
});
await check(
  "resend-sender-domain",
  ["RESEND_API_KEY", "RESEND_FROM"],
  async () => {
    const sender = environment.RESEND_FROM!.match(
      /<?([^<>\s]+@[^<>\s]+)>?$/,
    )?.[1];
    const domain = sender?.split("@")[1]?.toLowerCase();
    const result = await json("https://api.resend.com/domains", {
      Authorization: `Bearer ${environment.RESEND_API_KEY}`,
    });
    if (
      !domain ||
      !result.data?.some(
        (item: { name: string; status: string }) =>
          item.name.toLowerCase() === domain && item.status === "verified",
      )
    ) {
      throw new Error(
        "Sending domain not verified or API key cannot inspect domains",
      );
    }
    return "Configured sending domain is verified. No email sent; inbox delivery remains unverified.";
  },
);
await check("geoapify", ["GEOAPIFY_API_KEY"], async () => {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.search = new URLSearchParams({
    text: "Bakersfield, CA",
    limit: "1",
    apiKey: environment.GEOAPIFY_API_KEY!,
  }).toString();
  const result = await json(url.toString());
  if (!result.features?.length) throw new Error("No provider result");
  return "Public-city autocomplete succeeded. No personal address used or stored.";
});
await check("map-style", [], async () => {
  const result = await json(
    environment.NEXT_PUBLIC_MAP_STYLE_URL ||
      "https://tiles.openfreemap.org/styles/liberty",
  );
  if (result.version !== 8 || !result.sources || !Array.isArray(result.layers))
    throw new Error("Invalid map style");
  return "MapLibre style is reachable and structurally valid; individual tile delivery is not measured.";
});
for (const [name, field] of [
  ["authentication-fingerprint", "AUTH_FINGERPRINT_SECRET"],
  ["worker-authorization", "CRON_SECRET"],
  ["support-inbox", "PUBLIC_SUPPORT_EMAIL"],
  ["server-error-monitoring", "SENTRY_DSN"],
] as const) {
  checks.push({
    name,
    status: environment[field] ? "pass" : "blocked",
    detail: environment[field]
      ? "Setting present in supplied file; hosted configuration and delivery are unverified."
      : `Missing: ${field}`,
  });
}
const report = {
  schema: "provider-preflight-v1",
  capturedAt: new Date().toISOString(),
  configurationSource: file,
  environment: environment.APP_ENV,
  scope:
    "Read-only provider checks using a local configuration file; not an inventory of hosted Vercel variables",
  checks,
  payments: "deferred",
  emailSent: false,
  resourcesCreated: false,
  status: checks.every((item) => item.status === "pass") ? "pass" : "blocked",
};
await mkdir("artifacts/operations", { recursive: true });
const output = `artifacts/operations/provider-preflight-${environment.APP_ENV}-${Date.now()}.json`;
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ report: output, ...report }, null, 2));
process.exitCode = report.status === "pass" ? 0 : 2;
