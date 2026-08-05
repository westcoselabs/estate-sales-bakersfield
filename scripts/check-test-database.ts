import {
  createTestRunId,
  isolateDevelopmentDatabase,
  knownProductionDatabaseEnvironment,
  loadDevelopmentTestEnvironment,
  requireSafeDevelopmentDatabase,
} from "./test-database-safety";

try {
  loadDevelopmentTestEnvironment();
  const development = requireSafeDevelopmentDatabase({
    ...process.env,
    ...knownProductionDatabaseEnvironment(),
  });
  const database = isolateDevelopmentDatabase(development, createTestRunId());
  process.stdout.write(
    `Development Neon test-schema guard passed for endpoint ${database.endpointId} using ${database.schemaName}.\n`,
  );
} catch (error) {
  process.stderr.write(
    `BLOCKED: ${error instanceof Error ? error.message : "Development Neon configuration is unavailable"}\n`,
  );
  process.exitCode = 2;
}
