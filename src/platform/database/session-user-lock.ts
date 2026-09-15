import "server-only";

import { Prisma } from "@/generated/prisma/client";

/** Serialize session replacement and account-wide revocation on their owner. */
export async function lockSessionUser(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE
  `);
}
