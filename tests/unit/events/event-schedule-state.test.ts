import { describe, expect, it } from "vitest";

import {
  editorAddressRevealAt,
  editorScheduleDays,
  pacificLocalDateTime,
  scheduleValidationMessage,
  toggleScheduleDay,
} from "@/app/_components/event-schedule-state";

describe("daily schedule editor state", () => {
  it("keeps nonconsecutive dates sorted and preserves each day's edited hours", () => {
    const initial = [
      { date: "2026-10-06", startTime: "09:30", endTime: "14:15" },
    ];
    const selected = toggleScheduleDay(initial, "2026-10-04");
    expect(selected).toEqual([
      { date: "2026-10-04", startTime: "09:30", endTime: "14:15" },
      ...initial,
    ]);
    expect(toggleScheduleDay(selected, "2026-10-06")).toEqual([selected[0]]);
    expect(initial).toHaveLength(1);
  });

  it("starts with the requested everyday opening hours", () => {
    expect(toggleScheduleDay([], "2026-10-04")).toEqual([
      { date: "2026-10-04", startTime: "08:00", endTime: "13:00" },
    ]);
  });

  it("preserves saved daily hours instead of filling dates between them", () => {
    const days = [
      { date: "2026-10-04", startTime: "08:00", endTime: "13:00" },
      { date: "2026-10-06", startTime: "09:00", endTime: "12:30" },
    ];
    expect(
      editorScheduleDays({
        scheduleDays: days,
        localStartsAt: "2026-10-04T08:00",
        localEndsAt: "2026-10-06T12:30",
      }),
    ).toEqual(days);
  });

  it("lets an older multi-day draft be edited with daily closing times across a DST boundary", () => {
    expect(
      editorScheduleDays({
        localStartsAt: "2026-10-31T08:00",
        localEndsAt: "2026-11-02T13:00",
      }),
    ).toEqual([
      { date: "2026-10-31", startTime: "08:00", endTime: "13:00" },
      { date: "2026-11-01", startTime: "08:00", endTime: "13:00" },
      { date: "2026-11-02", startTime: "08:00", endTime: "13:00" },
    ]);
  });

  it("rejects missing days, missing hours, and a closing time before opening", () => {
    expect(scheduleValidationMessage([])).toMatch(/Select at least one/);
    expect(
      scheduleValidationMessage([
        { date: "2026-10-04", startTime: "", endTime: "13:00" },
      ]),
    ).toMatch(/Enter a start and end time/);
    expect(
      scheduleValidationMessage([
        { date: "2026-10-04", startTime: "13:00", endTime: "08:00" },
      ]),
    ).toMatch(/must be after/);
    expect(
      scheduleValidationMessage([
        { date: "2026-10-04", startTime: "08:00", endTime: "13:00" },
      ]),
    ).toBeNull();
  });
});

describe("address reveal editor state", () => {
  it("converts a saved reveal instant using Pacific time in summer and winter", () => {
    expect(pacificLocalDateTime("2026-10-04T13:00:00.000Z")).toBe(
      "2026-10-04T06:00",
    );
    expect(pacificLocalDateTime("2026-12-04T14:00:00.000Z")).toBe(
      "2026-12-04T06:00",
    );
    expect(pacificLocalDateTime("2026-10-04T07:00:00.000Z")).toBe(
      "2026-10-04T00:00",
    );
  });

  it("preserves a user-selected reveal time and supplies a start-time default for older drafts", () => {
    expect(
      editorAddressRevealAt({
        addressRevealAt: "2026-10-04T13:00:00.000Z",
        localStartsAt: "2026-10-04T08:00",
      }),
    ).toBe("2026-10-04T06:00");
    expect(editorAddressRevealAt({ localStartsAt: "2026-10-04T08:00" })).toBe(
      "2026-10-04T08:00",
    );
    expect(
      editorAddressRevealAt({
        localAddressRevealAt: "2026-10-03T20:00",
        addressRevealAt: "2026-10-04T03:00:00.000Z",
        localStartsAt: "2026-10-04T08:00",
      }),
    ).toBe("2026-10-03T20:00");
  });
});
