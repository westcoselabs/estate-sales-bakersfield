import { describe, expect, it } from "vitest";

import {
  prelaunchRobots,
  importedListingIndexingEnabled,
  sensitiveRobots,
} from "@/platform/seo/indexing-policy";

describe("fail-closed indexing policy", () => {
  it("requires a separate explicit approval for imported detail indexing", () => {
    const live = {
      APP_ENV: "production",
      STRIPE_MODE: "live",
      PRODUCTION_BETA_MODE: "false",
      PUBLIC_INDEXING_ENABLED: "true",
    };
    expect(importedListingIndexingEnabled(live)).toBe(false);
    expect(
      importedListingIndexingEnabled({
        ...live,
        PUBLIC_IMPORTED_INDEXING_ENABLED: "true",
      }),
    ).toBe(true);
    expect(
      importedListingIndexingEnabled({
        ...live,
        PUBLIC_IMPORTED_INDEXING_ENABLED: "true",
        PRODUCTION_BETA_MODE: "true",
      }),
    ).toBe(false);
  });
  it("keeps every prelaunch public page out of the index", () => {
    expect(prelaunchRobots).toMatchObject({
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    });
  });

  it("keeps sensitive application pages out of the index and link graph", () => {
    expect(sensitiveRobots).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    });
  });
});
