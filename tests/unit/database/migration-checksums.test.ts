import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import checksums from "../../../prisma/migrations/checksums.json";

describe("released migration checksums", () => {
  it("accounts for every migration and rejects edited historical bytes", async () => {
    const root = path.resolve("prisma/migrations");
    const migrations = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    expect(Object.keys(checksums).sort()).toEqual(migrations);
    for (const migration of migrations) {
      const bytes = await readFile(
        path.join(root, migration, "migration.sql"),
        "utf8",
      );
      const canonicalBytes = bytes.replaceAll("\r\n", "\n");
      expect(
        createHash("sha256").update(canonicalBytes, "utf8").digest("hex"),
        migration,
      ).toBe(checksums[migration as keyof typeof checksums]);
    }
  });
});
