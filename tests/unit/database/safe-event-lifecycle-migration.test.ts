import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("safe event lifecycle migration", () => {
  it("adds a non-destructive draft tombstone and exclusive terminal states", () => {
    const sql = fs.readFileSync(
      path.resolve(
        "prisma/migrations/20260730000000_safe_event_lifecycle/migration.sql",
      ),
      "utf8",
    );

    expect(sql).toContain('ADD COLUMN "deleted_at" TIMESTAMPTZ(3)');
    expect(sql).toContain('"events_terminal_disposition_exclusive"');
    expect(sql).toContain('"deleted_at" IS NOT NULL');
    expect(sql).toContain('"canceled_at" IS NOT NULL');
    expect(sql).toContain('"removed_at" IS NOT NULL');
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
