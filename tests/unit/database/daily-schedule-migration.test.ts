import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";

it("adds optional daily hours and reveal time without rewriting approved legacy data", async () => {
  const sql = await readFile(
    "prisma/migrations/20260915030000_daily_schedule_address_reveal/migration.sql",
    "utf8",
  );
  expect(sql).toContain('ADD COLUMN "schedule_days" JSONB');
  expect(sql).toContain('ADD COLUMN "address_reveal_at" TIMESTAMPTZ(3)');
  expect(sql).toContain("BETWEEN 1 AND 366");
  expect(sql).not.toMatch(
    /UPDATE\s+"events"|UPDATE\s+"event_publications"|DROP\s+COLUMN/i,
  );
});
