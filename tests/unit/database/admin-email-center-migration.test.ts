import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("admin email center migration", () => {
  it("enforces immutable revisions, recipient snapshots, and one receipt reference", async () => {
    const sql = await readFile(
      path.join(
        process.cwd(),
        "prisma/migrations/20260731120000_admin_email_center/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "email_template_revisions"');
    expect(sql).toContain('"email_template_revisions_immutable"');
    expect(sql).toContain('"email_campaign_recipients_immutable"');
    expect(sql).toContain('"email_deliveries_payment_attempt_id_key"');
    expect(sql).toContain('"email_deliveries_receipt_reference_check"');
    expect(sql).toContain('CREATE TABLE "resend_webhook_events"');
  });
});
