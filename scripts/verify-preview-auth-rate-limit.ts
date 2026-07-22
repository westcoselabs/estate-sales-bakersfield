import { createHash, randomUUID } from "node:crypto";

import { PrismaNeon } from "@prisma/adapter-neon";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";

class ExpectedRollback extends Error {
  override readonly name = "ExpectedRollback";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

if (
  process.env.APP_ENV !== "preview" ||
  process.env.DATABASE_RESOURCE_ENV !== "preview"
) {
  process.stderr.write(
    "BLOCKED: Preview auth rate-limit verification requires APP_ENV=preview and DATABASE_RESOURCE_ENV=preview.\n",
  );
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  process.stderr.write(
    "BLOCKED: Preview auth rate-limit verification requires DATABASE_URL.\n",
  );
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

try {
  const marker = randomUUID();
  const scopeHash = sha256(`preview-auth-rate-limit-smoke:v1:${marker}:scope`);
  const identifierHash = sha256(
    `preview-auth-rate-limit-smoke:v1:${marker}:identifier`,
  );

  await prisma
    .$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ attempt_count: number }>
      >(Prisma.sql`
        INSERT INTO "authentication_rate_limit_buckets" (
          "environment",
          "scope_hash",
          "namespace",
          "identifier_hash",
          "attempt_count",
          "window_started_at",
          "expires_at",
          "updated_at"
        ) VALUES (
          'preview',
          ${scopeHash},
          'register:network',
          ${identifierHash},
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + 60 * INTERVAL '1 second',
          CURRENT_TIMESTAMP
        )
        RETURNING "attempt_count"
      `);

      if (rows[0]?.attempt_count !== 1) {
        throw new Error("Preview auth rate-limit verification returned no row");
      }
      throw new ExpectedRollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof ExpectedRollback)) throw error;
    });

  process.stdout.write("Preview auth rate-limit table verified.\n");
} finally {
  await prisma.$disconnect();
}
