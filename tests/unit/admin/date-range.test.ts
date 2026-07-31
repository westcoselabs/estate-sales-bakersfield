import { describe, expect, it } from "vitest";

import {
  adminDateRange,
  parseAdminDateRange,
  trendBucket,
} from "@/modules/admin/application/date-range";

describe("admin reporting date ranges", () => {
  it("uses Los Angeles local midnight across daylight-saving transitions", () => {
    const spring = adminDateRange("7d", new Date("2026-03-10T19:00:00.000Z"));
    expect(spring.from?.toISOString()).toBe("2026-03-04T08:00:00.000Z");
    expect(spring.to.toISOString()).toBe("2026-03-10T19:00:00.000Z");

    const autumn = adminDateRange(
      "today",
      new Date("2026-11-02T20:00:00.000Z"),
    );
    expect(autumn.from?.toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("keeps the configured half-open range and bucket policy", () => {
    const now = new Date("2026-07-30T18:00:00.000Z");
    expect(adminDateRange("today", now).bucket).toBe("hour");
    expect(adminDateRange("30d", now).bucket).toBe("day");
    expect(adminDateRange("year", now).bucket).toBe("month");
    expect(adminDateRange("all", now).from).toBeNull();
    expect(parseAdminDateRange("unknown")).toBe("30d");
  });

  it("creates stable timezone-aware trend keys", () => {
    expect(trendBucket(new Date("2026-07-30T08:30:00.000Z"), "hour").key).toBe(
      "2026-07-30T01",
    );
  });
});
