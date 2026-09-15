import { inspectOperationalReadiness } from "./operational-readiness";

if (process.argv.length !== 3 || process.argv[2] !== "--run")
  throw new Error(
    "Pass --run with APP_URL and CRON_SECRET configured. This command only reads health/readiness.",
  );
try {
  const report = await inspectOperationalReadiness(
    process.env.APP_URL ?? "",
    process.env.CRON_SECRET ?? "",
  );
  console.log(
    JSON.stringify(
      { capturedAt: new Date().toISOString(), ...report },
      null,
      2,
    ),
  );
  process.exitCode = report.status === "ready" ? 0 : 1;
} catch {
  console.error(
    "Readiness check blocked: configure an HTTPS APP_URL origin and CRON_SECRET. No credentials logged.",
  );
  process.exitCode = 2;
}
