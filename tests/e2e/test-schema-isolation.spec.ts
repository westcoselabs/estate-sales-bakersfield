import { expect, test } from "@playwright/test";

import { PrismaClient } from "@/generated/prisma/client";
import { createNeonAdapter } from "@/platform/database/neon-adapter";
import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";
import { verifyRestrictedTestRuntime } from "../../scripts/test-database-run";

test("serves the application from the wrapper-owned Development schema", async ({
  request,
}) => {
  const database = requireIsolatedTestDatabase();
  await verifyRestrictedTestRuntime(database);
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const prisma = new PrismaClient({
    adapter: createNeonAdapter(database.directUrl),
  });
  try {
    const rows = await prisma.$queryRaw<Array<{ schema_name: string }>>`
      SELECT current_schema()::text AS schema_name
    `;
    expect(rows).toEqual([{ schema_name: database.schemaName }]);
  } finally {
    await prisma.$disconnect();
  }
});
