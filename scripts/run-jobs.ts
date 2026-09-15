import { setTimeout as delay } from "node:timers/promises";

import { runConfiguredJobBatch } from "../src/platform/jobs/configured-runner";
import { runConfiguredEmailJobBatch } from "../src/modules/email/infrastructure/configured-email-jobs";

const args = process.argv.slice(2);
if (
  args.some((arg) => !["--once", "--continuous"].includes(arg)) ||
  args.length > 1
) {
  throw new Error("Usage: run-jobs.ts [--once | --continuous]");
}
const continuous = args.includes("--continuous");
const shutdown = new AbortController();
const stop = () => shutdown.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

do {
  try {
    const maintenance = await runConfiguredJobBatch(50);
    const email = shutdown.signal.aborted
      ? null
      : await runConfiguredEmailJobBatch(50);
    process.stdout.write(`${JSON.stringify({ maintenance, email })}\n`);
  } catch (error) {
    // Worker diagnostics never serialize provider messages or credentials.
    process.stderr.write(
      `${JSON.stringify({ errorType: error instanceof Error ? error.name : "UnknownError" })}\n`,
    );
    if (!continuous) {
      process.exitCode = 1;
      break;
    }
  }
  if (!continuous || shutdown.signal.aborted) break;
  await delay(5_000, undefined, { signal: shutdown.signal }).catch(
    () => undefined,
  );
} while (!shutdown.signal.aborted);
