import { createHash } from "node:crypto";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.APP_ENV !== "preview") {
  process.stderr.write(
    "BLOCKED: live Neon verification requires APP_ENV=preview.\n",
  );
  process.exitCode = 2;
} else if (process.env.DATABASE_RESOURCE_ENV !== "preview") {
  process.stderr.write(
    "BLOCKED: live Neon verification requires DATABASE_RESOURCE_ENV=preview.\n",
  );
  process.exitCode = 2;
} else if (!databaseUrl || !process.env.DIRECT_URL) {
  process.stderr.write(
    "BLOCKED: DATABASE_URL and DIRECT_URL are required for live Neon verification.\n",
  );
  process.exitCode = 2;
} else {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: databaseUrl }),
  });
  const marker = `preview-live-${crypto.randomUUID()}@example.test`;
  const fixtureHash = (purpose: string) =>
    createHash("sha256").update(`${marker}:${purpose}`).digest("hex");
  try {
    const extension = await prisma.$queryRaw<Array<{ extversion: string }>>`
      SELECT "extversion" FROM "pg_extension" WHERE "extname" = 'postgis'
    `;
    if (!extension[0]?.extversion) throw new Error("PostGIS is not enabled");

    await prisma
      .$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            displayName: "Live verification fixture",
            email: marker,
            normalizedEmail: marker,
            passwordHash: "$argon2id$live-fixture",
          },
        });
        await transaction.session.create({
          data: {
            userId: user.id,
            tokenHash: fixtureHash("session"),
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        await transaction.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: fixtureHash("verification"),
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        await transaction.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: fixtureHash("reset"),
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        await transaction.organizerProfile.create({
          data: {
            userId: user.id,
            displayName: "Live organizer",
            contactName: "Live verifier",
            contactEmail: marker,
            status: "COMPLETE",
          },
        });
        await transaction.emailDelivery.create({
          data: {
            userId: user.id,
            kind: "EMAIL_VERIFICATION",
            recipientHash: fixtureHash("recipient"),
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
      `${JSON.stringify({
        postgis: extension[0].extversion,
        migrationAndTransaction: "verified",
        phase2Schema: "verified",
      })}\n`,
    );
  } finally {
    await prisma.user
      .deleteMany({ where: { normalizedEmail: marker } })
      .catch(() => undefined);
    await prisma.$disconnect();
  }
}
