import { afterAll, describe, expect, it } from "vitest";

import { runJobBatch } from "@/modules/jobs/application/runner";
import { PrismaDurableJobRepository } from "@/modules/jobs/infrastructure/prisma-job-repository";

import { createIntegrationClient } from "./support/database";

const prisma = createIntegrationClient();
const repository = new PrismaDurableJobRepository(prisma);

function uniqueQueue(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("minimal durable job foundation", () => {
  it("deduplicates, claims, and completes one transactionally stored job", async () => {
    const deduplicationKey = crypto.randomUUID();
    const queue = uniqueQueue("success");
    const first = await repository.enqueue({
      queue,
      type: "SUCCEEDS",
      payload: { fixture: true },
      deduplicationKey,
    });
    const duplicate = await repository.enqueue({
      queue,
      type: "SUCCEEDS",
      payload: { fixture: "ignored" },
      deduplicationKey,
    });
    expect(duplicate.id).toBe(first.id);

    const result = await runJobBatch(
      repository,
      { SUCCEEDS: async () => undefined },
      { queue, workerId: "worker-success", limit: 1 },
    );
    expect(result).toMatchObject({ claimed: 1, succeeded: 1 });
    await expect(
      prisma.durableJob.findUnique({ where: { id: first.id } }),
    ).resolves.toMatchObject({
      status: "SUCCEEDED",
      attempts: 1,
      lockedAt: null,
      lockedBy: null,
    });
  });

  it("retries safely and reaches a dead-letter terminal state", async () => {
    const firstTime = new Date("2026-07-16T12:00:00.000Z");
    const queue = uniqueQueue("retry");
    const queued = await repository.enqueue({
      queue,
      type: "FAILS",
      payload: {},
      maxAttempts: 2,
      runAt: firstTime,
    });
    const first = await runJobBatch(
      repository,
      { FAILS: async () => Promise.reject(new Error("expected failure")) },
      {
        queue,
        workerId: "worker-retry-1",
        now: () => firstTime,
        random: () => 0,
      },
    );
    expect(first.retried).toBe(1);

    const secondTime = new Date(firstTime.getTime() + 10_000);
    const second = await runJobBatch(
      repository,
      { FAILS: async () => Promise.reject(new Error("expected failure")) },
      {
        queue,
        workerId: "worker-retry-2",
        now: () => secondTime,
        random: () => 0,
      },
    );
    expect(second.dead).toBe(1);
    await expect(
      prisma.durableJob.findUnique({ where: { id: queued.id } }),
    ).resolves.toMatchObject({
      status: "DEAD",
      attempts: 2,
      lastErrorCode: "Error",
    });
  });

  it("recovers stale worker locks before claiming available work", async () => {
    const lockedAt = new Date("2026-07-16T10:00:00.000Z");
    const queue = uniqueQueue("stale");
    const queued = await repository.enqueue({
      queue,
      type: "SUCCEEDS",
      payload: {},
      runAt: lockedAt,
    });
    await repository.claim({
      queue,
      workerId: "crashed-worker",
      limit: 1,
      now: lockedAt,
    });

    const result = await runJobBatch(
      repository,
      { SUCCEEDS: async () => undefined },
      {
        queue,
        workerId: "recovery-worker",
        now: () => new Date("2026-07-16T12:00:00.000Z"),
        staleLockMs: 60_000,
      },
    );
    expect(result.recoveredLocks).toBe(1);
    await expect(
      prisma.durableJob.findUnique({ where: { id: queued.id } }),
    ).resolves.toMatchObject({
      status: "SUCCEEDED",
      attempts: 2,
    });
  });

  it("dead-letters a stale lock that consumed the final attempt", async () => {
    const lockedAt = new Date("2026-07-16T10:00:00.000Z");
    const queue = uniqueQueue("stale-terminal");
    const queued = await repository.enqueue({
      queue,
      type: "NEVER_REACHED",
      payload: {},
      maxAttempts: 1,
      runAt: lockedAt,
    });
    await repository.claim({
      queue,
      workerId: "crashed-final-worker",
      limit: 1,
      now: lockedAt,
    });

    await expect(
      repository.recoverStaleLocks(
        new Date("2026-07-16T11:59:00.000Z"),
        new Date("2026-07-16T12:00:00.000Z"),
      ),
    ).resolves.toBeGreaterThanOrEqual(1);
    await expect(
      prisma.durableJob.findUnique({ where: { id: queued.id } }),
    ).resolves.toMatchObject({
      status: "DEAD",
      attempts: 1,
      lastErrorCode: "STALE_LOCK",
    });
  });
});
