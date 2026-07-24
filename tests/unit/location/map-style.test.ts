import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configuredMapStyle,
  OPEN_FREE_MAP_LIBERTY_STYLE_URL,
  TEST_MAP_STYLE_URL,
} from "@/features/location/map-style";

describe("map style configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the approved production OpenFreeMap Liberty style by default", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "");

    expect(OPEN_FREE_MAP_LIBERTY_STYLE_URL).toBe(
      "https://tiles.openfreemap.org/styles/liberty",
    );
    expect(configuredMapStyle()).toBe(OPEN_FREE_MAP_LIBERTY_STYLE_URL);
  });

  it("uses the deterministic inline style only for the explicit test URL", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", TEST_MAP_STYLE_URL);

    expect(configuredMapStyle()).toMatchObject({
      version: 8,
      sources: {},
    });
  });
});
