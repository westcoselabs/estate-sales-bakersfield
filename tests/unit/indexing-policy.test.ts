import { describe, expect, it } from "vitest";

import {
  prelaunchRobots,
  sensitiveRobots,
} from "@/platform/seo/indexing-policy";

describe("fail-closed indexing policy", () => {
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
