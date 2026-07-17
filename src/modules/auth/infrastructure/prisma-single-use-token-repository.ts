import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type { SingleUseTokenRepository } from "../application/ports";

export class PrismaSingleUseTokenRepository implements SingleUseTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceActive(
    input: Parameters<SingleUseTokenRepository["replaceActive"]>[0],
  ) {
    await this.prisma.$transaction(async (transaction) => {
      if (input.kind === "EMAIL_VERIFICATION") {
        await transaction.emailVerificationToken.deleteMany({
          where: { userId: input.userId, consumedAt: null },
        });
        await transaction.emailVerificationToken.create({
          data: {
            userId: input.userId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          },
        });
        return;
      }

      await transaction.passwordResetToken.deleteMany({
        where: { userId: input.userId, consumedAt: null },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });
    });
  }

  async consume(input: Parameters<SingleUseTokenRepository["consume"]>[0]) {
    const table =
      input.kind === "EMAIL_VERIFICATION"
        ? Prisma.raw('"email_verification_tokens"')
        : Prisma.raw('"password_reset_tokens"');
    const rows = await this.prisma.$queryRaw<
      Array<{ user_id: string }>
    >(Prisma.sql`
      UPDATE ${table}
      SET "consumed_at" = ${input.now}, "attempt_count" = "attempt_count" + 1
      WHERE "token_hash" = ${input.tokenHash}
        AND "consumed_at" IS NULL
        AND "expires_at" > ${input.now}
      RETURNING "user_id"
    `);
    return rows[0]?.user_id ?? null;
  }
}
