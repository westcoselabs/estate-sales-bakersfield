import { describe, expect, it } from "vitest";

import {
  localDateTimeToUtc,
  validatedSchedule,
} from "@/modules/events/domain/schedule";

describe("event local schedule conversion", () => {
  it("converts an unambiguous IANA local time to its UTC instant", () => {
    expect(
      localDateTimeToUtc(
        "2026-07-25T09:00",
        "America/Los_Angeles",
      ).toISOString(),
    ).toBe("2026-07-25T16:00:00.000Z");
  });

  it("rejects nonexistent and ambiguous daylight-saving times", () => {
    expect(() =>
      localDateTimeToUtc("2026-03-08T02:30", "America/Los_Angeles"),
    ).toThrow(/does not exist/);
    expect(() =>
      localDateTimeToUtc("2026-11-01T01:30", "America/Los_Angeles"),
    ).toThrow(/ambiguous/);
  });

  it("rejects invalid zones and end-before-start schedules", () => {
    expect(() => localDateTimeToUtc("2026-07-25T09:00", "Not/AZone")).toThrow(
      /valid IANA/,
    );
    expect(() =>
      validatedSchedule({
        localStartsAt: "2026-07-25T15:00",
        localEndsAt: "2026-07-25T09:00",
        timezone: "America/Los_Angeles",
      }),
    ).toThrow(/end after/);
  });
});
