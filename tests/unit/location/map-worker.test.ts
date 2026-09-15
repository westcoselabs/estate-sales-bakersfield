import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getVersion, getWorkerUrl, setWorkerUrl } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { prepareMapLibreWorkers } from "../../../scripts/prepare-maplibre-workers";
import { configureMapWorker } from "@/features/location/map-worker";

describe("MapLibre module worker deployment", () => {
  it("prepares the worker URL and its required relative shared-module import in the same public directory", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "estate-map-worker-"),
    );
    const oldWorkerUrl = getWorkerUrl();
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
    try {
      prepareMapLibreWorkers();
      configureMapWorker();
      expect(getWorkerUrl()).toBe(
        `/maplibre/${getVersion()}/maplibre-gl-worker.mjs`,
      );
      const workerPath = path.join(directory, "public", getWorkerUrl());
      const worker = await readFile(workerPath, "utf8");
      expect(worker).toContain("./maplibre-gl-shared.mjs");
      const shared = await readFile(
        path.join(path.dirname(workerPath), "maplibre-gl-shared.mjs"),
        "utf8",
      );
      expect(shared.length).toBeGreaterThan(1_000);
      // Preparing a subsequent development/build run remains safe and keeps
      // the installed worker version paired with its shared implementation.
      prepareMapLibreWorkers();
      expect(await readFile(workerPath, "utf8")).toBe(worker);
    } finally {
      cwd.mockRestore();
      setWorkerUrl(oldWorkerUrl);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
