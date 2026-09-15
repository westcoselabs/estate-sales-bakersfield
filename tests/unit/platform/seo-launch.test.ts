import { afterEach, describe, expect, it, vi } from "vitest";

import {
  publicIndexingEnabled,
  publicRobots,
  searchRobots,
  sensitiveRobots,
} from "@/platform/seo/indexing-policy";

const launch = {
  PUBLIC_INDEXING_ENABLED: "true",
  APP_ENV: "production",
  PRODUCTION_BETA_MODE: "false",
  STRIPE_MODE: "live",
};
afterEach(() => vi.unstubAllEnvs());

describe("public indexing launch gate", () => {
  it("requires every launch condition and an explicit opt-in", () => {
    expect(publicIndexingEnabled({})).toBe(false);
    expect(publicIndexingEnabled(launch)).toBe(true);
    for (const override of [
      { PUBLIC_INDEXING_ENABLED: undefined },
      { PUBLIC_INDEXING_ENABLED: "false" },
      { PUBLIC_INDEXING_ENABLED: "TRUE" },
      { APP_ENV: "preview" },
      { APP_ENV: "local" },
      { APP_ENV: "test" },
      { PRODUCTION_BETA_MODE: "true" },
      { PRODUCTION_BETA_MODE: undefined },
      { STRIPE_MODE: "test" },
      { STRIPE_MODE: undefined },
    ])
      expect(publicIndexingEnabled({ ...launch, ...override })).toBe(false);
  });

  it("keeps beta and utility routes excluded when public pages become eligible", () => {
    for (const [key, value] of Object.entries(launch)) vi.stubEnv(key, value);
    expect(publicRobots()).toMatchObject({
      index: true,
      googleBot: { index: true },
    });
    expect(searchRobots).toMatchObject({ index: false, follow: true });
    expect(sensitiveRobots).toMatchObject({ index: false, follow: false });
    vi.stubEnv("PRODUCTION_BETA_MODE", "true");
    expect(publicRobots()).toMatchObject({
      index: false,
      googleBot: { index: false },
    });
  });
});
