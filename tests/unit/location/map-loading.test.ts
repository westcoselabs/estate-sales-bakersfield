import { describe, expect, it, vi } from "vitest";

import {
  classifyMapError,
  createMapLoadMonitor,
  mapStyleHost,
} from "@/features/location/map-loading";

describe("Explore map loading", () => {
  it("adds markers as soon as the style is ready", () => {
    const onStyleReady = vi.fn();
    const monitor = createMapLoadMonitor({
      styleHost: "tiles.openfreemap.org",
      onStyleReady,
      onFallback: vi.fn(),
      onDiagnostic: vi.fn(),
    });

    monitor.start();
    monitor.styleLoaded();
    monitor.styleLoaded();

    expect(onStyleReady).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("falls back when the style never becomes ready", () => {
    vi.useFakeTimers();
    const onFallback = vi.fn();
    const monitor = createMapLoadMonitor({
      styleHost: "tiles.openfreemap.org",
      onStyleReady: vi.fn(),
      onFallback,
      onDiagnostic: vi.fn(),
      timeoutMs: 20,
    });

    monitor.start();
    vi.advanceTimersByTime(20);

    expect(onFallback).toHaveBeenCalledWith({
      category: "style-timeout",
      host: "tiles.openfreemap.org",
      hasSourceOrTileContext: false,
    });
    monitor.dispose();
    vi.useRealTimers();
  });

  it("shows the fallback for a style request failure before style readiness", () => {
    const onFallback = vi.fn();
    const monitor = createMapLoadMonitor({
      styleHost: "tiles.openfreemap.org",
      onStyleReady: vi.fn(),
      onFallback,
      onDiagnostic: vi.fn(),
    });

    monitor.error({
      error: {
        message: "Failed to fetch",
        url: "https://tiles.openfreemap.org/styles/liberty",
      },
    });

    expect(onFallback).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("reports tile and source failures without replacing a usable map", () => {
    const onFallback = vi.fn();
    const onDiagnostic = vi.fn();
    const monitor = createMapLoadMonitor({
      styleHost: "tiles.openfreemap.org",
      onStyleReady: vi.fn(),
      onFallback,
      onDiagnostic,
    });

    monitor.start();
    monitor.styleLoaded();
    monitor.error({
      tile: {},
      error: {
        message: "Failed to fetch tile",
        url: "https://tiles.openfreemap.org/planet/private-tile-path",
      },
    });
    monitor.error({
      sourceId: "openmaptiles",
      error: { message: "Source metadata was unavailable" },
    });

    expect(onFallback).not.toHaveBeenCalled();
    expect(onDiagnostic).toHaveBeenCalledWith({
      category: "tile",
      host: "tiles.openfreemap.org",
      hasSourceOrTileContext: true,
    });
    expect(onDiagnostic).toHaveBeenCalledWith({
      category: "source",
      host: null,
      hasSourceOrTileContext: true,
    });
    monitor.dispose();
  });

  it("classifies WebGL failures and retains only a safe host", () => {
    expect(
      classifyMapError({
        error: {
          message: "WebGL context lost at 35.37,-119.01",
          url: "https://tiles.openfreemap.org/planet/10/173/405.pbf?token=secret",
        },
      }),
    ).toEqual({
      category: "webgl",
      host: "tiles.openfreemap.org",
      hasSourceOrTileContext: false,
    });
    expect(mapStyleHost("https://tiles.openfreemap.org/styles/liberty")).toBe(
      "tiles.openfreemap.org",
    );
  });
});
