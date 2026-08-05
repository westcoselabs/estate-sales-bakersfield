import {
  knownProductionDatabaseEnvironment,
  requireSafeDevelopmentDatabase,
  TEST_SCHEMA_PATTERN,
} from "./test-database-safety";
import { dropIsolatedTestSchema } from "./test-database-run";

const schemaName = process.env.TEST_SCHEMA_WATCHDOG_SCHEMA;
const directUrl = process.env.TEST_SCHEMA_WATCHDOG_DIRECT_URL;
const parentPid = Number(process.env.TEST_SCHEMA_WATCHDOG_PARENT_PID);
if (
  !schemaName ||
  !TEST_SCHEMA_PATTERN.test(schemaName) ||
  !directUrl ||
  !Number.isSafeInteger(parentPid) ||
  parentPid <= 0
) {
  process.exit(2);
}
const watchedSchemaName = schemaName;
const watchedDirectUrl = directUrl;

const development = requireSafeDevelopmentDatabase({
  ...process.env,
  APP_ENV: "test",
  DATABASE_RESOURCE_ENV: "development",
  DATABASE_URL: watchedDirectUrl,
  DIRECT_URL: watchedDirectUrl,
  ...knownProductionDatabaseEnvironment(),
});
let completed = false;
let cleaning = false;

async function cleanAfterAbandonedParent(): Promise<void> {
  if (completed || cleaning) return;
  cleaning = true;
  try {
    await dropIsolatedTestSchema({
      ...development,
      pooledUrl: watchedDirectUrl,
      directUrl: watchedDirectUrl,
      schemaName: watchedSchemaName,
    });
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

process.on("message", (message) => {
  if (message !== "completed") return;
  completed = true;
  process.exit(0);
});
process.on("disconnect", () => void cleanAfterAbandonedParent());
process.on("SIGINT", () => void cleanAfterAbandonedParent());
process.on("SIGTERM", () => void cleanAfterAbandonedParent());

const parentCheck = setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch {
    clearInterval(parentCheck);
    void cleanAfterAbandonedParent();
  }
}, 250);
