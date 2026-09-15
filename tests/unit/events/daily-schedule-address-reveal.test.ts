import { describe, expect, it, vi } from "vitest";

import { approvalDigest } from "@/modules/events/application/approval";
import { EventService } from "@/modules/events/application/event-service";
import type { EventRepository } from "@/modules/events/application/ports";
import {
  futurePublicEventProjection,
  publicEventProjection,
  toEventEditorDto,
} from "@/modules/events/application/policy";
import {
  eventLocationSchema,
  eventScheduleSchema,
} from "@/modules/events/application/schemas";
import { validatedScheduleDays } from "@/modules/events/domain/schedule";
import type {
  EventRecord,
  EventScheduleDay,
} from "@/modules/events/domain/types";
import type { LocationProvider } from "@/modules/locations";
import type { ImageProcessor, MediaStore } from "@/modules/media";

import { principal } from "../payments/fixtures";
import { readyEvent } from "./fixtures";

const timezone = "America/Los_Angeles";
const days: readonly EventScheduleDay[] = [
  { date: "2026-10-04", startTime: "08:00", endTime: "13:00" },
  { date: "2026-10-05", startTime: "08:00", endTime: "13:00" },
  { date: "2026-10-06", startTime: "08:00", endTime: "13:00" },
];

function fixture(changes: Partial<EventRecord> = {}) {
  const event = readyEvent({
    id: "10000000-0000-4000-8000-000000000001",
    ...changes,
  });
  const updateSchedule = vi.fn(
    async (input: Parameters<EventRepository["updateSchedule"]>[0]) => ({
      ...event,
      ...input,
      version: event.version + 1,
    }),
  );
  const updateLocation = vi.fn(
    async (input: Parameters<EventRepository["updateLocation"]>[0]) => ({
      ...event,
      ...input,
      location: event.location,
      version: event.version + 1,
    }),
  );
  const repository = {
    findOwned: vi.fn(async () => event),
    updateSchedule,
    updateLocation,
  } as unknown as EventRepository;
  return {
    event,
    updateSchedule,
    updateLocation,
    service: new EventService(
      repository,
      {} as LocationProvider,
      {} as MediaStore,
      {} as ImageProcessor,
      "test",
    ),
  };
}

function locationInput(
  event: EventRecord,
  localAddressRevealAt: string | null,
) {
  const location = event.location!;
  return eventLocationSchema.parse({
    expectedVersion: event.version,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    region: location.region,
    postalCode: location.postalCode,
    countryCode: location.countryCode,
    timezone,
    privacyMode: "HIDDEN_UNTIL_START",
    localAddressRevealAt,
  });
}

describe("daily event opening hours", () => {
  it("sorts selected dates and keeps a separate close for every day", async () => {
    const saved = fixture();
    const input = eventScheduleSchema.parse({
      expectedVersion: saved.event.version,
      timezone,
      scheduleDays: [...days].reverse(),
    });
    const editor = await saved.service.updateSchedule(
      principal,
      saved.event.id,
      input,
    );
    expect(saved.updateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleDays: days,
        localStartsAt: "2026-10-04T08:00",
        localEndsAt: "2026-10-06T13:00",
        startsAt: new Date("2026-10-04T15:00:00.000Z"),
        endsAt: new Date("2026-10-06T20:00:00.000Z"),
      }),
    );
    expect(editor.scheduleDays).toEqual(days);
    expect(validatedScheduleDays(days, timezone)[1]).toEqual({
      ...days[1],
      startsAt: "2026-10-05T15:00:00.000Z",
      endsAt: "2026-10-05T20:00:00.000Z",
    });
  });

  it("saves changes to an intermediate day's close even when overall bounds are unchanged", async () => {
    const saved = fixture({
      scheduleDays: days,
      localStartsAt: "2026-10-04T08:00",
      localEndsAt: "2026-10-06T13:00",
    });
    await saved.service.updateSchedule(principal, saved.event.id, {
      expectedVersion: saved.event.version,
      timezone,
      scheduleDays: days.map((day, index) => ({
        ...day,
        endTime: index === 1 ? "12:00" : day.endTime,
      })),
    });
    expect(saved.updateSchedule).toHaveBeenCalledOnce();
  });

  it("allows nonconsecutive selected dates and converts DST offsets per day", () => {
    const schedule = validatedScheduleDays(
      [
        { date: "2026-10-31", startTime: "08:00", endTime: "13:00" },
        { date: "2026-11-02", startTime: "08:00", endTime: "13:00" },
      ],
      timezone,
    );
    expect(schedule.map((day) => day.startsAt)).toEqual([
      "2026-10-31T15:00:00.000Z",
      "2026-11-02T16:00:00.000Z",
    ]);
  });

  it.each([
    [[], "Select between"],
    [[days[0], days[0]], "only appear once"],
    [[{ date: "2026-02-30", startTime: "08:00", endTime: "13:00" }], "invalid"],
    [
      [{ date: "2026-10-04", startTime: "08:00", endTime: "08:00" }],
      "closing time",
    ],
    [
      [{ date: "2026-10-04", startTime: "23:00", endTime: "01:00" }],
      "closing time",
    ],
    [
      [{ date: "2026-03-08", startTime: "02:30", endTime: "13:00" }],
      "does not exist",
    ],
    [
      [{ date: "2026-11-01", startTime: "01:30", endTime: "13:00" }],
      "ambiguous",
    ],
  ])("rejects invalid daily schedules %#", (schedule, error) => {
    expect(() =>
      validatedScheduleDays(schedule as EventScheduleDay[], timezone),
    ).toThrow(error as string);
  });

  it("keeps legacy approvals stable and does not invent unrecorded daily hours", () => {
    const legacy = readyEvent();
    expect(futurePublicEventProjection(legacy).scheduleDays).toBeUndefined();
    const storedLegacy = readyEvent({
      scheduleDays: null,
      addressRevealAt: null,
    });
    expect(approvalDigest(legacy, futurePublicEventProjection(legacy))).toBe(
      approvalDigest(storedLegacy, futurePublicEventProjection(storedLegacy)),
    );
  });
});

describe("selected address release time", () => {
  it("saves a changed release time without reconfirming an unchanged address", async () => {
    const saved = fixture({
      privacyMode: "HIDDEN_UNTIL_START",
      addressRevealAt: new Date("2026-07-25T13:00:00Z"),
    });
    const editor = await saved.service.updateLocation(
      principal,
      saved.event.id,
      locationInput(saved.event, "2026-07-25T07:00"),
    );
    expect(saved.updateLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        addressRevealAt: new Date("2026-07-25T14:00:00Z"),
      }),
    );
    expect(editor.addressRevealAt).toBe("2026-07-25T14:00:00.000Z");
    expect(editor.localAddressRevealAt).toBe("2026-07-25T07:00");
  });

  it("requires a chosen time when an explicit hidden-address submission is empty", async () => {
    const saved = fixture();
    await expect(
      saved.service.updateLocation(
        principal,
        saved.event.id,
        locationInput(saved.event, null),
      ),
    ).rejects.toThrow("Choose the date and time");
    expect(saved.updateLocation).not.toHaveBeenCalled();
  });

  it("clears the selected release time when the full address is shown immediately", async () => {
    const saved = fixture({
      privacyMode: "HIDDEN_UNTIL_START",
      addressRevealAt: new Date("2026-07-25T13:00:00Z"),
    });
    await saved.service.updateLocation(principal, saved.event.id, {
      ...locationInput(saved.event, null),
      privacyMode: "EXACT_ADDRESS",
    });
    expect(saved.updateLocation).toHaveBeenCalledWith(
      expect.objectContaining({ addressRevealAt: null }),
    );
  });

  it("hides street details until the chosen instant, including a release after opening", () => {
    const event = readyEvent({
      privacyMode: "HIDDEN_UNTIL_START",
      addressRevealAt: new Date("2026-07-25T17:00:00Z"),
    });
    const hidden = publicEventProjection(
      event,
      new Date("2026-07-25T16:59:59.999Z"),
    );
    expect(hidden.address).toEqual({
      kind: "HIDDEN",
      city: "Bakersfield",
      region: "CA",
      postalCode: "93301",
      countryCode: "US",
      releasesAt: "2026-07-25T17:00:00.000Z",
    });
    expect(JSON.stringify(hidden)).not.toContain("123 Main");
    expect(JSON.stringify(hidden)).not.toContain("35.373292");
    expect(
      publicEventProjection(event, new Date("2026-07-25T17:00:00Z")).address
        .kind,
    ).toBe("EXACT");
    expect(futurePublicEventProjection(event).address.kind).toBe("EXACT");
  });

  it("includes the release time in the approval digest and falls back for old listings", () => {
    const event = readyEvent({ privacyMode: "HIDDEN_UNTIL_START" });
    const changed = {
      ...event,
      addressRevealAt: new Date("2026-07-25T13:00:00Z"),
    };
    expect(
      approvalDigest(changed, futurePublicEventProjection(changed)),
    ).not.toBe(approvalDigest(event, futurePublicEventProjection(event)));
    expect(toEventEditorDto(event).localAddressRevealAt).toBe(
      event.localStartsAt,
    );
    expect(
      publicEventProjection(event, new Date("2026-07-25T15:00:00Z")).address,
    ).toMatchObject({
      kind: "HIDDEN",
      releasesAt: event.startsAt!.toISOString(),
    });
  });
});
