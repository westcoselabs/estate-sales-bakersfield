import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const priorMigrationHashes = {
  "20260716000000_phase1_foundation":
    "e356131b1b35e332bbcf8766747262fd5b5bbcfd269f753ac5a2ad8405491624",
  "20260717000000_phase2_auth_and_organizers":
    "986138678b1fdd34b656f82d1aff36408bbb56b806ba0d6584016c5c1125a0f7",
  "20260721000000_phase3_event_builder":
    "ccd3355a1ae4e94412f3d28f5896d79c0d8dac47e5a81f40ed14b0a0991c87c7",
  "20260722000000_postgresql_auth_rate_limits":
    "ef8510db60f2765cdcbc9092bde4eacee3bff6a1633bb617ccac1d004a77866c",
} as const;

describe("Phase 4 migration guarantees", () => {
  it("leaves every prior forward migration byte-for-byte unchanged", async () => {
    for (const [migration, expected] of Object.entries(priorMigrationHashes)) {
      const bytes = await readFile(
        path.resolve(`prisma/migrations/${migration}/migration.sql`),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
    }
  });

  it("is forward-only and enforces payment, webhook, and publication invariants", async () => {
    const sql = await readFile(
      path.resolve(
        "prisma/migrations/20260723000000_phase4_paid_publication/migration.sql",
      ),
      "utf8",
    );
    expect(sql).not.toMatch(/DROP\s+(?:TABLE|TYPE|COLUMN)/i);
    expect(sql).toContain("payment_attempts_one_active_checkout_per_event");
    expect(sql).toContain("payment_attempts_immutable_correlation");
    expect(sql).toContain("stripe_webhook_events_pkey");
    expect(sql).toContain("event_publications_event_id_key");
    expect(sql).toContain("event_publications_payment_attempt_id_key");
    expect(sql).toContain("event_publications_paid_correlation");
    expect(sql).toContain("event_publications_immutable");
    expect(sql).toContain('expected_amount" > 0');
    expect(sql).toContain('failure_reason" VARCHAR(500)');
  });
});
