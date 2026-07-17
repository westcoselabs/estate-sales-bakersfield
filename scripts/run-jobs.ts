import { runConfiguredJobBatch } from "../src/modules/jobs";

const result = await runConfiguredJobBatch(10);
process.stdout.write(`${JSON.stringify(result)}\n`);
