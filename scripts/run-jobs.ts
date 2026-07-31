import { runConfiguredJobBatch } from "../src/platform/jobs/configured-runner";

const result = await runConfiguredJobBatch(10);
process.stdout.write(`${JSON.stringify(result)}\n`);
