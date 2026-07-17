import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !process.env.DIRECT_URL) {
  process.stderr.write(
    "BLOCKED: DATABASE_URL and DIRECT_URL are required for live Neon verification.\n",
  );
  process.exitCode = 2;
} else if (process.env.APP_ENV === "production") {
  process.stderr.write(
    "BLOCKED: live Neon verification may not target APP_ENV=production.\n",
  );
  process.exitCode = 2;
} else {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: databaseUrl }),
  });
  const marker = `phase1-live-${crypto.randomUUID()}@example.test`;
  try {
    const extension = await prisma.$queryRaw<Array<{ extversion: string }>>`
      SELECT "extversion" FROM "pg_extension" WHERE "extname" = 'postgis'
    `;
    if (!extension[0]?.extversion) throw new Error("PostGIS is not enabled");

    await prisma
      .$transaction(async (transaction) => {
        await transaction.user.create({
          data: {
            email: marker,
            normalizedEmail: marker,
            passwordHash: "$argon2id$live-fixture",
          },
        });
        throw new Error("EXPECTED_LIVE_ROLLBACK");
      })
      .catch((error: unknown) => {
        if (
          !(error instanceof Error) ||
          error.message !== "EXPECTED_LIVE_ROLLBACK"
        )
          throw error;
      });
    const count = await prisma.user.count({
      where: { normalizedEmail: marker },
    });
    if (count !== 0)
      throw new Error(
        "Live transaction rollback did not remove the fixture row",
      );
    process.stdout.write(
      `${JSON.stringify({ postgis: extension[0].extversion, migrationAndTransaction: "verified" })}\n`,
    );
  } finally {
    await prisma.user
      .deleteMany({ where: { normalizedEmail: marker } })
      .catch(() => undefined);
    await prisma.$disconnect();
  }
}
