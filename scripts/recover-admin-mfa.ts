import { Prisma } from "../src/generated/prisma/client";
import { getServerEnvironment } from "../src/platform/config/env";
import { getPrismaClient } from "../src/platform/database/client";

// Operator-only recovery; no HTTP handler calls this script. Database access
// and explicit target/environment confirmation are intentionally required.
function argument(name: string) {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

const userId = argument("user");
const environment = getServerEnvironment();
if (
  !userId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    userId,
  ) ||
  argument("environment") !== environment.APP_ENV ||
  argument("resource") !== environment.DATABASE_RESOURCE_ENV ||
  argument("confirm") !== `RESET-ADMIN-MFA:${userId}`
) {
  throw new Error(
    "Recovery requires --user=<uuid>, --environment=<APP_ENV>, --resource=<DATABASE_RESOURCE_ENV>, and --confirm=RESET-ADMIN-MFA:<uuid>. Verify the account owner independently before running this command.",
  );
}

const prisma = getPrismaClient();
try {
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`,
    );
    const user = await transaction.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.role !== "SUPER_ADMIN" ||
      user.status !== "ACTIVE" ||
      !user.emailVerifiedAt
    )
      throw new Error("The target must be the active, verified administrator.");
    await transaction.session.deleteMany({ where: { userId } });
    await transaction.adminMfaCredential.deleteMany({ where: { userId } });
    await transaction.auditEntry.create({
      data: {
        actorUserId: userId,
        action: "ADMIN_MFA_OPERATOR_RESET",
        targetType: "USER",
        targetId: userId,
        metadata: {
          source: "EXPLICIT_OPERATOR_RECOVERY",
          environment: environment.APP_ENV,
        },
      },
    });
  });
  process.stdout.write(
    "Administrator MFA reset and all account sessions revoked. The owner must sign in with their password and enroll a new authenticator before administrator access is restored.\n",
  );
} finally {
  await prisma.$disconnect();
}
