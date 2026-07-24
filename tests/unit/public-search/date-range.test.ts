import { describe, expect, it } from "vitest";

import { resolvePublicDateInterval } from "@/modules/public-search/application/date-range";
import type { PublicSearchCriteria } from "@/modules/public-search/domain/types";

function criteria(
  date: PublicSearchCriteria["date"],
  range: Pick<PublicSearchCriteria, "from" | "to"> = {
    from: null,
    to: null,
  },
): PublicSearchCriteria {
  return {
    sale: "all",
    date,
    ...range,
    location: "bakersfield-ca",
    sort: "soonest",
    view: "list",
    cursor: null,
  };
}

function isoRange(
  date: PublicSearchCriteria["date"],
  now: string,
  range?: Pick<PublicSearchCriteria, "from" | "to">,
) {
  const interval = resolvePublicDateInterval(
    criteria(date, range),
    new Date(now),
  );
  return interval
    ? [interval.startsAt.toISOString(), interval.endsAt.toISOString()]
    : null;
}

describe("public search date ranges in America/Los_Angeles", () => {
  it("uses the local calendar day and its half-open boundary for Today", () => {
    expect(isoRange("today", "2026-07-23T06:59:59.000Z")).toEqual([
      "2026-07-22T07:00:00.000Z",
      "2026-07-23T07:00:00.000Z",
    ]);
    expect(isoRange("today", "2026-07-23T07:00:00.000Z")).toEqual([
      "2026-07-23T07:00:00.000Z",
      "2026-07-24T07:00:00.000Z",
    ]);
  });

  it.each([
    [
      "Monday",
      "2026-07-20T20:00:00.000Z",
      "2026-07-24T07:00:00.000Z",
      "2026-07-27T07:00:00.000Z",
    ],
    [
      "Tuesday",
      "2026-07-21T20:00:00.000Z",
      "2026-07-24T07:00:00.000Z",
      "2026-07-27T07:00:00.000Z",
    ],
    [
      "Wednesday",
      "2026-07-22T20:00:00.000Z",
      "2026-07-24T07:00:00.000Z",
      "2026-07-27T07:00:00.000Z",
    ],
    [
      "Thursday",
      "2026-07-23T20:00:00.000Z",
      "2026-07-24T07:00:00.000Z",
      "2026-07-27T07:00:00.000Z",
    ],
    [
      "Friday",
      "2026-07-24T20:00:00.000Z",
      "2026-07-24T07:00:00.000Z",
      "2026-07-27T07:00:00.000Z",
    ],
    [
      "Saturday",
      "2026-07-25T20:00:00.000Z",
      "2026-07-25T07:00:00.000Z",
      "2026-07-27T07:00:00.000Z",
    ],
    [
      "Sunday",
      "2026-07-26T20:00:00.000Z",
      "2026-07-26T07:00:00.000Z",
      "2026-07-27T07:00:00.000Z",
    ],
  ])("maps This Weekend correctly on %s", (_weekday, now, startsAt, endsAt) => {
    expect(isoRange("weekend", now)).toEqual([startsAt, endsAt]);
  });

  it("keeps Next 7 Days on local dates across a month and year boundary", () => {
    expect(isoRange("next-7-days", "2026-12-28T20:00:00.000Z")).toEqual([
      "2026-12-28T08:00:00.000Z",
      "2027-01-04T08:00:00.000Z",
    ]);
  });

  it("treats a custom range as inclusive calendar dates and an exclusive end boundary", () => {
    expect(
      isoRange("custom", "2026-01-01T20:00:00.000Z", {
        from: "2028-02-28",
        to: "2028-03-01",
      }),
    ).toEqual(["2028-02-28T08:00:00.000Z", "2028-03-02T08:00:00.000Z"]);
  });

  it("honors spring and fall DST transitions without assuming 24-hour days", () => {
    const spring = resolvePublicDateInterval(
      criteria("today"),
      new Date("2026-03-08T20:00:00.000Z"),
    )!;
    const fall = resolvePublicDateInterval(
      criteria("today"),
      new Date("2026-11-01T20:00:00.000Z"),
    )!;

    expect([
      spring.startsAt.toISOString(),
      spring.endsAt.toISOString(),
      spring.endsAt.getTime() - spring.startsAt.getTime(),
    ]).toEqual([
      "2026-03-08T08:00:00.000Z",
      "2026-03-09T07:00:00.000Z",
      23 * 60 * 60 * 1000,
    ]);
    expect([
      fall.startsAt.toISOString(),
      fall.endsAt.toISOString(),
      fall.endsAt.getTime() - fall.startsAt.getTime(),
    ]).toEqual([
      "2026-11-01T07:00:00.000Z",
      "2026-11-02T08:00:00.000Z",
      25 * 60 * 60 * 1000,
    ]);
  });

  it("returns no interval for All and rejects invalid direct custom criteria", () => {
    expect(
      resolvePublicDateInterval(criteria("all"), new Date("2026-07-23")),
    ).toBeNull();
    expect(() =>
      resolvePublicDateInterval(
        criteria("custom", { from: "2026-08-03", to: "2026-08-01" }),
        new Date("2026-07-23"),
      ),
    ).toThrow("A valid custom date range is required");
  });
});
