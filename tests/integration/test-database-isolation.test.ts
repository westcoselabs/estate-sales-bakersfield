import { describe, expect, it } from "vitest";

import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";
import { verifyRestrictedTestRuntime } from "../../scripts/test-database-run";

describe("Development Neon test runtime isolation", () => {
  it("denies arbitrary schema creation and qualified public mutation", async () => {
    const database = requireIsolatedTestDatabase();

    await expect(
      verifyRestrictedTestRuntime(database),
    ).resolves.toBeUndefined();
  });
});
