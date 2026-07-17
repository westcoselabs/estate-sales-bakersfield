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
    claim: vi.fn(async () => [job]),
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
});
