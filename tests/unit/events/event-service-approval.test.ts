import { describe, expect, it, vi } from "vitest";

import { EventService } from "@/modules/events/application/event-service";
import type { EventRepository } from "@/modules/events/application/ports";
import { futurePublicEventProjection } from "@/modules/events/application/policy";
import { OrganizerProfileIncompleteError } from "@/modules/events/domain/errors";
import { PrismaEventRepository } from "@/modules/events/infrastructure/prisma-event-repository";
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
  it("keeps failed uploads from blocking approval of the remaining ready photos", async () => {
    const ready = readyEvent();
    const fixture = service(
      readyEvent({
        photos: [
          ...ready.photos,
          { ...ready.photos[0]!, id: "failed-photo", status: "FAILED" },
        ],
      }),
    );
    vi.mocked(fixture.events.approve).mockResolvedValue(fixture.event);
    await fixture.service.approve(principal, fixture.event.id, {
      expectedVersion: fixture.event.version,
      acceptedTerms: true,
      termsVersion: "2026-09-15-v1",
    });
    expect(fixture.events.approve).toHaveBeenCalledOnce();
  });

  it("checks for pending photos again inside the approval transaction", async () => {
    const findFirst = vi.fn(async () => null);
    const create = vi.fn();
    const repository = new PrismaEventRepository({
      $transaction: async (run: (transaction: unknown) => Promise<unknown>) =>
        run({ event: { findFirst }, eventApproval: { create } }),
    } as never);
    await expect(
      repository.approve({
        eventId: EVENT_ID,
        expectedVersion: 7,
        contentRevision: 6,
        principal,
        digest: "a".repeat(64),
        termsVersion: "2026-09-15-v1",
        now: clock(),
        audit: {},
      }),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          photos: {
            none: { status: { in: ["RESERVED", "UPLOADED", "PROCESSING"] } },
          },
        }),
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });
  it.each(["RESERVED", "UPLOADED", "PROCESSING"] as const)(
    "allows preview but rejects approval while another photo is %s",
    async (status) => {
      const ready = readyEvent();
      const fixture = service(
        readyEvent({
          photos: [
            ...ready.photos,
            { ...ready.photos[0]!, id: "photo-pending", status },
          ],
        }),
      );
      await expect(
        fixture.service.preview(principal, fixture.event.id),
      ).resolves.toMatchObject({
        gallery: [expect.objectContaining({ id: "photo-1" })],
      });
      await expect(
        fixture.service.approve(principal, fixture.event.id, {
          expectedVersion: fixture.event.version,
          acceptedTerms: true,
          termsVersion: "2026-09-15-v1",
        }),
      ).rejects.toThrow("Wait for all photo uploads");
      expect(fixture.events.approve).not.toHaveBeenCalled();
    },
  );
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
        termsVersion: "2026-09-15-v1",
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
        termsVersion: "2026-09-15-v1",
      }),
    ).rejects.toThrow("must start in the future");
    expect(fixture.events.approve).not.toHaveBeenCalled();
  });
});
