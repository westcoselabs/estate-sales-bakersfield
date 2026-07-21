import type { TestProject } from "vitest/node";

import {
  createTestRunId,
  loadDedicatedTestEnvironment,
  requireSafeTestDatabase,
} from "../../scripts/test-database-safety";
import {
  cleanupTestRun,
  deployTestMigrations,
} from "../../scripts/test-database-run";

export default async function setup(project: TestProject) {
  loadDedicatedTestEnvironment();
  const database = requireSafeTestDatabase();
  const runId = createTestRunId();
  deployTestMigrations(database, runId);
  project.provide("databaseUrl", database.pooledUrl);
  project.provide("testRunId", runId);

  return async () => {
    await cleanupTestRun(database, runId);
  };
}
