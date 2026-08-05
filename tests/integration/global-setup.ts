import type { TestProject } from "vitest/node";

import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";

export default async function setup(project: TestProject) {
  const database = requireIsolatedTestDatabase();
  const runId = process.env.TEST_RUN_ID;
  if (!runId || !/^testrun-[a-z0-9-]+$/.test(runId)) {
    throw new Error("Integration tests require a valid TEST_RUN_ID");
  }
  project.provide("databaseUrl", database.directUrl);
  project.provide("testRunId", runId);
}
