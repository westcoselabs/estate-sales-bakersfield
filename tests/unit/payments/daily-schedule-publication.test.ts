import { describe, expect, it } from "vitest";

import {
  createPublicationSnapshot,
  parsePublicationSnapshot,
  projectionAt,
} from "@/modules/payments/application/publication";

import { readyEvent } from "../events/fixtures";

function event() {
  return readyEvent({
    privacyMode: "HIDDEN_UNTIL_START",
    addressRevealAt: new Date("2026-10-04T13:00:00.000Z"),
    startsAt: new Date("2026-10-04T15:00:00.000Z"),
    endsAt: new Date("2026-10-06T20:00:00.000Z"),
    localStartsAt: "2026-10-04T08:00",
    localEndsAt: "2026-10-06T13:00",
    scheduleDays: [4, 5, 6].map((day) => ({
      date: `2026-10-0${String(day)}`,
      startTime: "08:00",
      endTime: "13:00",
    })),
  });
}

describe("daily hours and scheduled address release in immutable publications", () => {
  it("preserves every daily closing time after snapshot serialization and parsing", () => {
    const snapshot = parsePublicationSnapshot(
      JSON.parse(JSON.stringify(createPublicationSnapshot(event()))),
    );
    expect(snapshot.projection.scheduleDays).toEqual(
      [4, 5, 6].map((day) => ({
        date: `2026-10-0${String(day)}`,
        startTime: "08:00",
        endTime: "13:00",
        startsAt: `2026-10-0${String(day)}T15:00:00.000Z`,
        endsAt: `2026-10-0${String(day)}T20:00:00.000Z`,
      })),
    );
  });

  it("withholds the street until the exact chosen reveal boundary, before opening", () => {
    const snapshot = createPublicationSnapshot(event());
    const before = projectionAt(snapshot, new Date("2026-10-04T12:59:59.999Z"));
    expect(before.address).toMatchObject({
      kind: "HIDDEN",
      releasesAt: "2026-10-04T13:00:00.000Z",
    });
    expect(JSON.stringify(before)).not.toContain("123 Main Street");
    expect(
      projectionAt(snapshot, new Date("2026-10-04T13:00:00.000Z")).address,
    ).toMatchObject({ kind: "EXACT", addressLine1: "123 Main Street" });
  });

  it("keeps the address hidden after opening if the organizer chose a later reveal", () => {
    const snapshot = createPublicationSnapshot({
      ...event(),
      addressRevealAt: new Date("2026-10-05T13:00:00.000Z"),
    });
    expect(
      projectionAt(snapshot, new Date("2026-10-04T16:00:00.000Z")).address.kind,
    ).toBe("HIDDEN");
    expect(
      projectionAt(snapshot, new Date("2026-10-05T13:00:00.000Z")).address.kind,
    ).toBe("EXACT");
  });

  it("keeps the old start-time release behavior for existing snapshots", () => {
    const snapshot = createPublicationSnapshot({
      ...event(),
      addressRevealAt: null,
      scheduleDays: [],
    });
    expect(snapshot.addressRevealAt).toBeUndefined();
    expect(
      projectionAt(snapshot, new Date("2026-10-04T14:59:59.999Z")).address.kind,
    ).toBe("HIDDEN");
    expect(
      projectionAt(snapshot, new Date("2026-10-04T15:00:00.000Z")).address.kind,
    ).toBe("EXACT");
  });
});
