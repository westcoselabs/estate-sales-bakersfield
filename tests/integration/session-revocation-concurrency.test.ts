import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { PrismaAccountRepository } from "@/modules/auth/infrastructure/prisma-account-repository";
import { PrismaSessionRepository } from "@/modules/auth/infrastructure/prisma-session-repository";

import { createIntegrationClient } from "./support/database";
import {
  createListingImportReviewHarness,
  type ListingImportReviewHarness,
} from "./support/listing-import-review-fixtures";

const observer = createIntegrationClient();
const replacementConnection = createIntegrationClient();
const revocationConnection = createIntegrationClient();
let harness: ListingImportReviewHarness;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Pause real database transactions at their session-delete boundary. */
function observedTransactions(
  client: PrismaClient,
  hooks: {
    started?: (pid: number) => void;
    afterDelete?: () => Promise<void>;
    afterDeleteMany?: () => Promise<void>;
  },
): PrismaClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "$transaction")
        return Reflect.get(target, property, receiver);
      return (
        work: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        options?: {
          maxWait?: number;
          timeout?: number;
          isolationLevel?: Prisma.TransactionIsolationLevel;
        },
      ) =>
        target.$transaction(
          async (transaction) => {
            const connections = await transaction.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            const pid = connections[0]?.pid;
            if (pid === undefined)
              throw new Error("Missing test connection PID");
            hooks.started?.(pid);
            const traced = new Proxy(transaction, {
              get(tx, key, txReceiver) {
                if (key !== "session") return Reflect.get(tx, key, txReceiver);
                return new Proxy(tx.session, {
                  get(delegate, method, delegateReceiver) {
                    if (method === "delete")
                      return async (args: Prisma.SessionDeleteArgs) => {
                        const result = await delegate.delete(args);
                        await hooks.afterDelete?.();
                        return result;
                      };
                    if (method === "deleteMany")
                      return async (args: Prisma.SessionDeleteManyArgs) => {
                        const result = await delegate.deleteMany(args);
                        await hooks.afterDeleteMany?.();
                        return result;
                      };
                    return Reflect.get(delegate, method, delegateReceiver);
                  },
                });
              },
            });
            return work(traced);
          },
          { ...options, timeout: 15_000 },
        );
    },
  });
}

async function waitUntilBlocked(pid: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const [state] = await observer.$queryRaw<
          { blocked: boolean }[]
        >(Prisma.sql`
      SELECT cardinality(pg_blocking_pids(${pid}::integer)) > 0 AS blocked
    `);
        return state?.blocked;
      },
      { timeout: 8_000, interval: 25 },
    )
    .toBe(true);
}

async function createResetToken() {
  const tokenHash = hash(randomUUID());
  await observer.passwordResetToken.updateMany({
    where: {
      userId: harness.administratorId,
      consumedAt: null,
      invalidatedAt: null,
    },
    data: { invalidatedAt: new Date() },
  });
  await observer.passwordResetToken.create({
    data: {
      userId: harness.administratorId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return tokenHash;
}

beforeAll(async () => {
  harness = await createListingImportReviewHarness(observer);
});

afterAll(async () => {
  await Promise.all([
    observer.$disconnect(),
    replacementConnection.$disconnect(),
    revocationConnection.$disconnect(),
  ]);
});

describe("session replacement and account revocation serialize on the user", () => {
  for (const replacement of ["rotate", "reauthenticate"] as const) {
    for (const revocation of ["password-reset", "revoke-all"] as const) {
      it(`${revocation} revokes the committed MFA replacement from a concurrent ${replacement}`, async () => {
        const sessionId = await harness.createSession();
        const original = await observer.session.findUniqueOrThrow({
          where: { id: sessionId },
        });
        const resetTokenHash = await createResetToken();
        const deleted = deferred<void>();
        const release = deferred<void>();
        const revocationStarted = deferred<number>();
        const replacing = new PrismaSessionRepository(
          observedTransactions(replacementConnection, {
            afterDelete: async () => {
              deleted.resolve();
              await release.promise;
            },
          }),
        );
        const revoking = observedTransactions(revocationConnection, {
          started: revocationStarted.resolve,
        });
        const replacementTokenHash = hash(randomUUID());
        const replacementResult = replacing[replacement]({
          currentTokenHash: original.tokenHash,
          replacementTokenHash,
          replacementExpiresAt: original.expiresAt,
          metadata: {},
          now: new Date(),
          audit: {},
        });
        let revocationResult: Promise<unknown> | undefined;
        try {
          await deleted.promise;
          revocationResult =
            revocation === "password-reset"
              ? new PrismaAccountRepository(revoking).resetPassword({
                  tokenHash: resetTokenHash,
                  passwordHash: "concurrency-test-reset-hash",
                  now: new Date(),
                  audit: {},
                })
              : new PrismaSessionRepository(revoking).deleteAllForUser(
                  harness.administratorId,
                  {},
                );
          await waitUntilBlocked(await revocationStarted.promise);
          release.resolve();
          expect(await replacementResult).toMatchObject({
            mfaAuthenticatedAt: original.mfaAuthenticatedAt,
          });
          await revocationResult;
          expect(
            await observer.session.count({
              where: { userId: harness.administratorId },
            }),
          ).toBe(0);
          expect(
            await observer.session.findUnique({
              where: { tokenHash: replacementTokenHash },
            }),
          ).toBeNull();
        } finally {
          release.resolve();
          await Promise.allSettled([
            replacementResult,
            ...(revocationResult ? [revocationResult] : []),
          ]);
        }
      });
    }

    it(`${replacement} rereads the original session after a concurrent password reset commits`, async () => {
      const sessionId = await harness.createSession();
      const original = await observer.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const tokenHash = await createResetToken();
      const deleted = deferred<void>();
      const release = deferred<void>();
      const rotationStarted = deferred<number>();
      const resetting = new PrismaAccountRepository(
        observedTransactions(revocationConnection, {
          afterDeleteMany: async () => {
            deleted.resolve();
            await release.promise;
          },
        }),
      );
      const rotating = new PrismaSessionRepository(
        observedTransactions(replacementConnection, {
          started: rotationStarted.resolve,
        }),
      );
      const resetResult = resetting.resetPassword({
        tokenHash,
        passwordHash: "concurrency-test-reset-hash",
        now: new Date(),
        audit: {},
      });
      let rotationResult: Promise<unknown> | undefined;
      try {
        await deleted.promise;
        rotationResult = rotating[replacement]({
          currentTokenHash: original.tokenHash,
          replacementTokenHash: hash(randomUUID()),
          replacementExpiresAt: original.expiresAt,
          metadata: {},
          now: new Date(),
          audit: {},
        });
        await waitUntilBlocked(await rotationStarted.promise);
        release.resolve();
        expect(await resetResult).not.toBeNull();
        expect(await rotationResult).toBeNull();
        expect(
          await observer.session.count({
            where: { userId: harness.administratorId },
          }),
        ).toBe(0);
      } finally {
        release.resolve();
        await Promise.allSettled([
          resetResult,
          ...(rotationResult ? [rotationResult] : []),
        ]);
      }
    });
  }
});
