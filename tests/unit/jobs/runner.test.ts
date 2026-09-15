import { describe, expect, it, vi } from "vitest";

import type { DurableJobRepository } from "@/modules/jobs/application/ports";
import { retryDelayMs, runJobBatch } from "@/modules/jobs/application/runner";
import type { DurableJob } from "@/modules/jobs/domain/types";

const job: DurableJob = {
  id: "job-1",
  queue: "default",
  type: "TEST_JOB",
  payload: { value: 42 },
  status: "RUNNING",
  runAt: new Date(0),
  attempts: 1,
  maxAttempts: 3,
  lockedBy: "worker-1",
};

function repositoryFixture() {
  return {
    enqueue: vi.fn(async () => job),
    claim: vi.fn<DurableJobRepository["claim"]>(async () => [job]),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => "RETRY" as const),
    recoverStaleLocks: vi.fn(async () => 0),
  } satisfies DurableJobRepository;
}

describe("durable job runner", () => {
  it("completes a claimed job", async () => {
    const repository = repositoryFixture();
    const handler = vi.fn(async () => undefined);

    const result = await runJobBatch(
      repository,
      { TEST_JOB: handler },
      {
        queue: "default",
        workerId: "worker-1",
        now: () => new Date("2026-07-16T12:00:00.000Z"),
      },
    );

    expect(handler).toHaveBeenCalledWith(
      { value: 42 },
      { jobId: "job-1", attempt: 1 },
    );
    expect(result).toMatchObject({
      claimed: 1,
      succeeded: 1,
      retried: 0,
      dead: 0,
    });
  });

  it("records retry disposition without swallowing the failure", async () => {
    const repository = repositoryFixture();
    const result = await runJobBatch(
      repository,
      { TEST_JOB: async () => Promise.reject(new Error("fixture failure")) },
      {
        queue: "default",
        workerId: "worker-1",
        now: () => new Date("2026-07-16T12:00:00.000Z"),
        random: () => 0,
      },
    );

    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "Error",
        errorMessage: "fixture failure",
      }),
    );
    expect(result.retried).toBe(1);
  });

  it("bounds exponential retry delay and jitter", () => {
    expect(retryDelayMs(1, () => 0)).toBe(5_000);
    expect(retryDelayMs(2, () => 0.5)).toBe(11_000);
    expect(retryDelayMs(100, () => 1)).toBe(4_320_000);
  });

  it("drains in bounded parallel waves without preclaiming waiting jobs", async () => {
    const repository = repositoryFixture();
    const pending = Array.from({ length: 7 }, (_, index) => ({
      ...job,
      id: `job-${index}`,
    }));
    repository.claim.mockImplementation(async (input?: { limit: number }) =>
      pending.splice(0, input?.limit ?? 1),
    );
    let active = 0;
    let maximumActive = 0;
    const handled: string[] = [];
    const result = await runJobBatch(
      repository,
      {
        TEST_JOB: async (_payload, context) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await Promise.resolve();
          handled.push(context.jobId);
          active -= 1;
        },
      },
      {
        queue: "default",
        workerId: "worker-1",
        limit: 5,
        concurrency: 2,
        drain: true,
      },
    );
    expect(result).toMatchObject({ claimed: 5, succeeded: 5 });
    expect(maximumActive).toBe(2);
    expect(new Set(handled).size).toBe(5);
    expect(pending).toHaveLength(2);
    expect(repository.claim.mock.calls.map(([input]) => input?.limit)).toEqual([
      2, 2, 1,
    ]);
  });

  it("stops admitting work before the deadline and finishes already-started handlers", async () => {
    const repository = repositoryFixture();
    let time = 0;
    const result = await runJobBatch(
      repository,
      {
        TEST_JOB: async () => {
          time = 16_000;
        },
      },
      {
        queue: "default",
        workerId: "worker-1",
        limit: 50,
        concurrency: 1,
        drain: true,
        deadlineAt: new Date(20_000),
        now: () => new Date(time),
      },
    );
    expect(result).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.complete).toHaveBeenCalledTimes(1);
  });

  it("does not claim a job when the admission budget has already expired", async () => {
    const repository = repositoryFixture();
    const result = await runJobBatch(
      repository,
      {},
      {
        queue: "default",
        workerId: "worker-1",
        drain: true,
        now: () => new Date(20_000),
        deadlineAt: new Date(20_000),
      },
    );
    expect(result.claimed).toBe(0);
    expect(repository.claim).not.toHaveBeenCalled();
  });
});
