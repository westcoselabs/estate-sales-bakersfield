import type { PrismaClient } from "@/generated/prisma/client";

/** Trusted fixture proof for repository tests that do not exercise TOTP itself. */
export async function administratorMfaProof(
  prisma: PrismaClient,
  userId: string,
  authenticatedAt = new Date(),
) {
  const credential = await prisma.adminMfaCredential.upsert({
    where: { userId },
    create: {
      userId,
      encryptedSecret: "integration-fixture-encrypted-secret",
      enabledAt: authenticatedAt,
      version: 1,
    },
    update: {},
    select: { version: true, enabledAt: true, encryptedSecret: true },
  });
  if (!credential.enabledAt || !credential.encryptedSecret) {
    throw new Error(
      "Administrator fixture requires an enabled MFA credential.",
    );
  }
  return {
    mfaAuthenticatedAt: authenticatedAt,
    mfaCredentialVersion: credential.version,
  };
}
