import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("super-admin MVP migration", () => {
  it("enforces singleton ownership, session recency, consent, and consistency", async () => {
    const migration = await readFile(
      path.resolve(
        "prisma/migrations/20260730120000_super_admin_mvp/migration.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN'");
    expect(migration).toContain("users_single_super_admin_idx");
    expect(migration).toContain("password_authenticated_at");
    expect(migration).toContain("marketing_preferences_consent_consistency");
    expect(migration).toContain("users_restriction_consistency");
    expect(migration).toContain("events_removal_reason_consistency");
    expect(migration).toContain("WHERE \"payment_state\" = 'PAID'");
  });
});
