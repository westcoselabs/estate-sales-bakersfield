import { describe, expect, it, vi } from "vitest";
import { runStagedPhotoUploadPipeline } from "@/app/_components/photo-upload-pipeline";
import { photoUploadV2Enabled } from "@/modules/events/application/photo-upload-rollout";
import { photoUploadMetricsSchema } from "@/modules/events/application/photo-upload-metrics";

describe("bounded photo pipeline", () => {
  it("overlaps stages, bounds work while finalization stalls, and preserves reservation order", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reserved: number[] = [];
    const prepared: number[] = [];
    const transferred: number[] = [];
    const ready: number[] = [];
    let active = 0;
    let peak = 0;
    const pending = runStagedPhotoUploadPipeline(
      Array.from({ length: 150 }, (_, i) => i),
      {
        signal: new AbortController().signal,
        prepare: async (item) => {
          prepared.push(item);
          return item;
        },
        reserve: async (item) => {
          reserved.push(item);
          return item;
        },
        transfer: async (item) => {
          transferred.push(item);
          return item;
        },
        finalize: async (item) => {
          active++;
          peak = Math.max(peak, active);
          await gate;
          ready.push(item);
          active--;
        },
        failed: (item, error) => {
          throw new Error(`Unexpected failure ${item}`, { cause: error });
        },
      },
    );
    await vi.waitFor(() => expect(transferred).toHaveLength(8));
    expect(prepared.length).toBeLessThanOrEqual(12);
    expect(ready).toHaveLength(0);
    expect(peak).toBe(2);
    release();
    await pending;
    expect(ready).toHaveLength(150);
    expect(reserved).toEqual(Array.from({ length: 150 }, (_, i) => i));
  });

  it("contains individual failures and continues processing the batch", async () => {
    const ready: number[] = [];
    const failed = vi.fn();
    await runStagedPhotoUploadPipeline([0, 1, 2, 3], {
      signal: new AbortController().signal,
      prepare: async (item) => {
        if (item === 1) throw new Error("Bad photo");
        return item;
      },
      reserve: async (item) => item,
      transfer: async (item) => {
        if (item === 2) throw new Error("Network");
        return item;
      },
      finalize: async (item) => {
        ready.push(item);
      },
      failed,
    });
    expect(ready.sort()).toEqual([0, 3]);
    expect(failed).toHaveBeenCalledTimes(2);
  });

  it("wakes blocked stages when aborted", async () => {
    const controller = new AbortController();
    const pending = runStagedPhotoUploadPipeline(
      Array.from({ length: 50 }, (_, i) => i),
      {
        signal: controller.signal,
        prepare: async (item) => item,
        reserve: async (item) => item,
        transfer: async (item) => item,
        finalize: async () => {
          controller.abort();
        },
        failed: vi.fn(),
      },
    );
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("has stable rollout cohorts and rejects private or inconsistent metrics", () => {
    expect(photoUploadV2Enabled("account", 0)).toBe(false);
    expect(photoUploadV2Enabled("account", 100)).toBe(true);
    expect(photoUploadV2Enabled("account", 10)).toBe(
      photoUploadV2Enabled("account", 10),
    );
    const metrics = {
      batchId: crypto.randomUUID(),
      selected: 150,
      ready: 150,
      failed: 0,
      pending: 0,
      originalBytes: 600_000_000,
      preparedBytes: 90_000_000,
      preparationMs: 60_000,
      totalMs: 150_000,
      softwareDecoded: 0,
    };
    expect(photoUploadMetricsSchema.safeParse(metrics).success).toBe(true);
    expect(
      photoUploadMetricsSchema.safeParse({
        ...metrics,
        fileName: "private.heic",
      }).success,
    ).toBe(false);
    expect(
      photoUploadMetricsSchema.safeParse({ ...metrics, ready: 149 }).success,
    ).toBe(false);
  });
});
