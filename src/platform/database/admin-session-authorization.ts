import "server-only";

import { Prisma } from "@/generated/prisma/client";

const RECENT_AUTHENTICATION_MILLISECONDS = 15 * 60 * 1_000;

/** Rechecks the exact session and any enrolled MFA under transaction locks. */
export async function authorizedAdministratorSession(
  transaction: Prisma.TransactionClient,
  input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly requireRecent?: boolean;
  },
): Promise<Date | null> {
  // MFA enrollment/rotation takes these locks in the same order.
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "users" WHERE "id" = ${input.userId}::uuid FOR SHARE
  `);
  await transaction.$queryRaw(Prisma.sql`
    SELECT "user_id" FROM "admin_mfa_credentials"
    WHERE "user_id" = ${input.userId}::uuid FOR SHARE
  `);
  const recent = input.requireRecent
    ? Prisma.sql`
        AND session."password_authenticated_at" >= CURRENT_TIMESTAMP -
          (${RECENT_AUTHENTICATION_MILLISECONDS} * INTERVAL '1 millisecond')
        AND (credential."enabled_at" IS NULL OR
          session."mfa_authenticated_at" >= CURRENT_TIMESTAMP -
            (${RECENT_AUTHENTICATION_MILLISECONDS} * INTERVAL '1 millisecond'))
      `
    : Prisma.empty;
  const sessions = await transaction.$queryRaw<
    { authorizedAt: Date }[]
  >(Prisma.sql`
    SELECT CURRENT_TIMESTAMP AS "authorizedAt"
    FROM "sessions" session
    JOIN "users" administrator ON administrator."id" = session."user_id"
    LEFT JOIN "admin_mfa_credentials" credential ON credential."user_id" = administrator."id"
    WHERE session."id" = ${input.sessionId}::uuid
      AND session."user_id" = ${input.userId}::uuid
      AND session."expires_at" > CURRENT_TIMESTAMP
      AND session."password_authenticated_at" <= CURRENT_TIMESTAMP
      AND (credential."enabled_at" IS NULL OR (
        session."mfa_authenticated_at" IS NOT NULL
        AND session."mfa_authenticated_at" <= CURRENT_TIMESTAMP
        AND session."mfa_credential_version" = credential."version"
        AND credential."enabled_at" <= CURRENT_TIMESTAMP
        AND credential."encrypted_secret" IS NOT NULL
      ))
      AND administrator."role" = 'SUPER_ADMIN'::"user_role"
      AND administrator."status" = 'ACTIVE'::"account_status"
      AND administrator."email_verified_at" IS NOT NULL
      ${recent}
    FOR SHARE OF session
  `);
  return sessions[0]?.authorizedAt ?? null;
}
