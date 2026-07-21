import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Phase 3 migration guarantees", () => {
  it("is forward-only and encodes the critical event, location, photo, and approval guards", async () => {
    const sql = await readFile(
      path.resolve(
        "prisma/migrations/20260721000000_phase3_event_builder/migration.sql",
      ),
      "utf8",
    );
    expect(sql).not.toMatch(/DROP\s+(?:TABLE|TYPE|COLUMN)/i);
    expect(sql).toContain('UNIQUE INDEX "events_public_id_key"');
    expect(sql).toContain('"ends_at" > "starts_at"');
    expect(sql).toContain("enforce_event_photo_limit");
    expect(sql).toContain("enforce_event_cover_photo");
    expect(sql).toContain("enforce_event_approval_ownership");
    expect(sql).toContain("event_approvals_event_id_content_revision_key");
    expect(sql).toContain("enforce_current_event_approval");
    expect(sql).toContain('USING GIST ("coordinates")');
  });
});
