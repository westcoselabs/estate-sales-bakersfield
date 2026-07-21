import {
  loadDedicatedTestEnvironment,
  requireSafeTestDatabase,
} from "./test-database-safety";

loadDedicatedTestEnvironment();

try {
  const database = requireSafeTestDatabase();
  process.stdout.write(
    `Test Neon safety guard passed for endpoint ${database.endpointId}.\n`,
  );
} catch (error) {
  process.stderr.write(
    `BLOCKED: ${error instanceof Error ? error.message : "Test Neon configuration is unavailable"}\n`,
  );
  process.exitCode = 2;
}
