import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("PostgreSQL authentication rate-limit migration", () => {
  it("is forward-only and encodes scoped hashed fixed-window buckets", async () => {
    const sql = await readFile(
      path.resolve(
        "prisma/migrations/20260722000000_postgresql_auth_rate_limits/migration.sql",
      ),
      "utf8",
    );

    expect(sql).not.toMatch(/DROP\s+(?:TABLE|TYPE|COLUMN)/i);
    expect(sql).toContain('CREATE TABLE "authentication_rate_limit_buckets"');
    expect(sql).toContain('"scope_hash" CHAR(64) NOT NULL');
    expect(sql).toContain('"identifier_hash" CHAR(64) NOT NULL');
    expect(sql).toContain(
      '"environment",\n    "scope_hash",\n    "namespace",\n    "identifier_hash"',
    );
    expect(sql).toContain("authentication_rate_limit_environment");
    expect(sql).toContain("authentication_rate_limit_identifier_hash");
    expect(sql).toContain("authentication_rate_limit_window");
    expect(sql).toContain("authentication_rate_limit_buckets_expires_at_idx");
    expect(sql).toContain(
      "authentication_rate_limit_buckets_environment_scope_hash_expires_at_idx",
    );
  });
});
