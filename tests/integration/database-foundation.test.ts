import { afterAll, describe, expect, it } from "vitest";

import { createIntegrationClient } from "./support/database";

const prisma = createIntegrationClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("fresh PostgreSQL/PostGIS foundation", () => {
  it("applies the real migration and enables PostGIS", async () => {
    const extension = await prisma.$queryRaw<Array<{ extversion: string }>>`
      SELECT "extversion" FROM "pg_extension" WHERE "extname" = 'postgis'
    `;
    expect(extension[0]?.extversion).toMatch(/^3\./);

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT "table_name"
      FROM "information_schema"."tables"
      WHERE "table_schema" = 'public'
      ORDER BY "table_name"
    `;
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "audit_entries",
        "durable_jobs",
        "email_verification_tokens",
        "password_reset_tokens",
        "sessions",
        "users",
      ]),
    );
  });

  it("rolls back failed transactions", async () => {
    const normalizedEmail = `rollback-${crypto.randomUUID()}@example.test`;
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.user.create({
          data: {
            email: normalizedEmail,
            normalizedEmail,
            passwordHash: "$argon2id$fixture",
          },
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    await expect(
      prisma.user.count({ where: { normalizedEmail } }),
    ).resolves.toBe(0);
  });
});
