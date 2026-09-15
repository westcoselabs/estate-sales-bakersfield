import { describe, expect, it, vi } from "vitest";

import {
  createPhotoMutationQueue,
  runPhotoUploadPipeline,
} from "@/app/_components/photo-upload-pipeline";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe("photo upload pipeline", () => {
  it("keeps at most the configured number of files active and processes every queued file once", async () => {
    const items = Array.from({ length: 8 }, (_, index) => index);
    const release = items.map(() => deferred());
    const entered = items.map(() => deferred());
    const started: number[] = [];
    const completed: number[] = [];
    let active = 0;
    let maximumActive = 0;
    const pipeline = runPhotoUploadPipeline(items, {
      concurrency: 3,
      signal: new AbortController().signal,
      process: async (item) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        started.push(item);
        entered[item]!.resolve();
        await release[item]!.promise;
        completed.push(item);
        active -= 1;
      },
    });

    try {
      await Promise.all(entered.slice(0, 3).map((gate) => gate.promise));
      expect(started).toEqual([0, 1, 2]);
      expect(active).toBe(3);
      release[1]!.resolve();
      await entered[3]!.promise;
      expect(started).toEqual([0, 1, 2, 3]);
      expect(completed).toEqual([1]);
      expect(active).toBe(3);
    } finally {
      for (const gate of release) gate.resolve();
      await pipeline;
    }
    expect(maximumActive).toBe(3);
    expect(active).toBe(0);
    expect(started).toEqual(items);
    expect(completed.toSorted((left, right) => left - right)).toEqual(items);
  });

  it("finishes a fast file and starts the next while an earlier slow file is still uploading", async () => {
    const slow = deferred();
    const fast = deferred();
    const next = deferred();
    const nextStarted = deferred();
    const nextFinished = deferred();
    const finished: string[] = [];
    let pipelineFinished = false;
    const pipeline = runPhotoUploadPipeline(["slow", "fast", "next"] as const, {
      concurrency: 2,
      signal: new AbortController().signal,
      process: async (item) => {
        if (item === "next") nextStarted.resolve();
        await { slow, fast, next }[item]!.promise;
        finished.push(item);
        if (item === "next") nextFinished.resolve();
      },
    }).then(() => {
      pipelineFinished = true;
    });

    try {
      fast.resolve();
      await nextStarted.promise;
      expect(finished).toEqual(["fast"]);
      next.resolve();
      await nextFinished.promise;
      expect(finished).toEqual(["fast", "next"]);
      expect(pipelineFinished).toBe(false);
    } finally {
      slow.resolve();
      fast.resolve();
      next.resolve();
      await pipeline;
    }
    expect(finished).toEqual(["fast", "next", "slow"]);
  });

  it("stops admitting queued photos after cancellation and lets active work settle", async () => {
    const controller = new AbortController();
    const activeWork = deferred();
    const started: number[] = [];
    const completed: number[] = [];
    const pipeline = runPhotoUploadPipeline([0, 1, 2, 3, 4], {
      concurrency: 2,
      signal: controller.signal,
      process: async (item) => {
        started.push(item);
        await activeWork.promise;
        completed.push(item);
      },
    });
    expect(started).toEqual([0, 1]);
    controller.abort();
    activeWork.resolve();
    await pipeline;
    expect(started).toEqual([0, 1]);
    expect(completed).toEqual([0, 1]);
  });

  it("does not start any photo when the signal was already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const process = vi.fn().mockResolvedValue(undefined);
    await runPhotoUploadPipeline(["queued-photo"], {
      concurrency: 4,
      signal: controller.signal,
      process,
    });
    expect(process).not.toHaveBeenCalled();
  });
});

describe("photo draft mutation queue", () => {
  it("serializes version changes and continues queued and future mutations after a rejection", async () => {
    const run = createPhotoMutationQueue();
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const started: string[] = [];
    let version = 1;
    const first = run(async () => {
      started.push("first");
      firstStarted.resolve();
      await releaseFirst.promise;
      version += 1;
      return version;
    });
    const failed = run(async () => {
      started.push("failed");
      expect(version).toBe(2);
      throw new Error("Photo finalization failed");
    });
    const rejection = expect(failed).rejects.toThrow(
      "Photo finalization failed",
    );
    const third = run(async () => {
      started.push("third");
      expect(version).toBe(2);
      version += 1;
      return version;
    });

    await firstStarted.promise;
    expect(started).toEqual(["first"]);
    releaseFirst.resolve();
    await expect(first).resolves.toBe(2);
    await rejection;
    await expect(third).resolves.toBe(3);
    await expect(
      run(async () => {
        started.push("fourth");
        version += 1;
        return version;
      }),
    ).resolves.toBe(4);
    expect(started).toEqual(["first", "failed", "third", "fourth"]);
  });
});
