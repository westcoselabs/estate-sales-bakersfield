import {
  createTestRunId,
  isolateDevelopmentDatabase,
  knownProductionDatabaseEnvironment,
  loadDevelopmentTestEnvironment,
  requireSafeDevelopmentDatabase,
} from "./test-database-safety";
import { verifyTestLifecycleCapabilities } from "./test-database-run";

async function main(): Promise<void> {
  loadDevelopmentTestEnvironment();
  const development = requireSafeDevelopmentDatabase({
    ...process.env,
    ...knownProductionDatabaseEnvironment(),
  });
  await verifyTestLifecycleCapabilities(development);
  const database = isolateDevelopmentDatabase(development, createTestRunId());
  process.stdout.write(
    `Development Neon lifecycle guard passed for endpoint ${database.endpointId}; test commands will use a generated restricted role for ${database.schemaName}.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `BLOCKED: ${error instanceof Error ? error.message : "Development Neon configuration is unavailable"}\n`,
  );
  process.exitCode = 2;
});
