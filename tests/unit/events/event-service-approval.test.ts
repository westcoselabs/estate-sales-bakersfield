import { describe, expect, it, vi } from "vitest";

import { EventService } from "@/modules/events/application/event-service";
import type { EventRepository } from "@/modules/events/application/ports";
import { futurePublicEventProjection } from "@/modules/events/application/policy";
import { OrganizerProfileIncompleteError } from "@/modules/events/domain/errors";
import type { LocationProvider } from "@/modules/locations";
import type { ImageProcessor, MediaStore } from "@/modules/media";

import { principal } from "../payments/fixtures";
import { readyEvent } from "./fixtures";

const clock = () => new Date("2026-07-24T12:00:00.000Z");
const EVENT_ID = "10000000-0000-4000-8000-000000000001";

function service(event = readyEvent()) {
  const stored = { ...event, id: EVENT_ID };
  const events = {
    findOwned: vi.fn(async () => stored),
    approve: vi.fn(),
  } as unknown as EventRepository;
  return {
    event: stored,
    events,
    service: new EventService(
      events,
      {} as LocationProvider,
      {} as MediaStore,
      {} as ImageProcessor,
      "test",
      clock,
    ),
  };
}

describe("event approval boundaries", () => {
  it("uses the exact same future projection for owner preview", async () => {
    const fixture = service(readyEvent({ privacyMode: "HIDDEN_UNTIL_START" }));
    await expect(
      fixture.service.preview(principal, fixture.event.id),
    ).resolves.toEqual(futurePublicEventProjection(fixture.event));
  });

  it("returns a typed organizer-profile failure before repository approval", async () => {
    const fixture = service(readyEvent({ organizerStatus: "INCOMPLETE" }));
    await expect(
      fixture.service.approve(principal, fixture.event.id, {
        expectedVersion: 7,
        acceptedTerms: true,
        termsVersion: "2026-07-phase3-v1",
      }),
    ).rejects.toBeInstanceOf(OrganizerProfileIncompleteError);
    expect(fixture.events.approve).not.toHaveBeenCalled();
  });

  it("rejects approval at the authoritative start instant", async () => {
    const fixture = service(readyEvent({ startsAt: clock() }));
    await expect(
      fixture.service.approve(principal, fixture.event.id, {
        expectedVersion: fixture.event.version,
        acceptedTerms: true,
        termsVersion: "2026-07-phase3-v1",
      }),
    ).rejects.toThrow("must start in the future");
    expect(fixture.events.approve).not.toHaveBeenCalled();
  });
});
