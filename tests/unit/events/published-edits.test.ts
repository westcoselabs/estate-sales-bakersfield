import { describe, expect, it, vi } from "vitest";

import { EventService } from "@/modules/events/application/event-service";
import type { EventRepository } from "@/modules/events/application/ports";
import { editedPublicationSnapshot } from "@/modules/events/application/published-edits";
import type { EventRecord } from "@/modules/events/domain/types";
import type { LocationProvider } from "@/modules/locations";
import type { ImageProcessor, MediaStore } from "@/modules/media";
import {
  createPublicationSnapshot,
  parsePublicationSnapshot,
} from "@/modules/payments/application/publication";

import { principal } from "../payments/fixtures";
import { readyEvent } from "./fixtures";

const now = new Date("2026-07-25T18:00:00Z");
function fixture(changes: Partial<EventRecord> = {}) {
  const event = readyEvent({
    id: "10000000-0000-4000-8000-000000000001",
    publication: {
      paymentAttemptId: "payment-1",
      approvedRevision: 6,
      approvalDigest: "a".repeat(64),
      canonicalPath: "/estate-sales/summer-estate-sale-abc123def456",
      publishedAt: now,
    },
    ...changes,
  });
  const repository = {
    findOwned: vi.fn(async () => event),
    updateDetails: vi.fn(async () => event),
    updateSchedule: vi.fn(async () => event),
    deletePhoto: vi.fn(async () => event),
  } as unknown as EventRepository;
  const service = new EventService(
    repository,
    {} as LocationProvider,
    {} as MediaStore,
    {} as ImageProcessor,
    "test",
    () => now,
  );
  return { event, repository, service };
}

describe("published event editing", () => {
  it("allows about and schedule changes after the sale has started", async () => {
    const { event, repository, service } = fixture();
    await service.updateDetails(principal, event.id, {
      expectedVersion: event.version,
      title: "Updated sale",
      description: "New furniture added today.",
    });
    await service.updateSchedule(principal, event.id, {
      expectedVersion: event.version,
      timezone: "America/Los_Angeles",
      scheduleDays: [
        { date: "2026-07-25", startTime: "09:00", endTime: "17:00" },
      ],
    });
    expect(repository.updateDetails).toHaveBeenCalledOnce();
    expect(repository.updateSchedule).toHaveBeenCalledOnce();
  });

  it.each([{ endsAt: now }, { canceledAt: now }, { removedAt: now }])(
    "rejects edits to terminal events: %o",
    async (changes) => {
      const { event, repository, service } = fixture(changes);
      await expect(
        service.updateDetails(principal, event.id, {
          expectedVersion: event.version,
          title: "Changed",
          description: "Changed description.",
        }),
      ).rejects.toThrow();
      expect(repository.updateDetails).not.toHaveBeenCalled();
    },
  );

  it("rejects stale edits and removal of the published cover", async () => {
    const { event, repository, service } = fixture();
    await expect(
      service.updateDetails(principal, event.id, {
        expectedVersion: event.version - 1,
        title: "Changed",
        description: "Changed description.",
      }),
    ).rejects.toThrow();
    await expect(
      service.deletePhoto(
        principal,
        event.id,
        event.coverPhotoId!,
        event.version,
      ),
    ).rejects.toThrow("cover");
    expect(repository.updateDetails).not.toHaveBeenCalled();
    expect(repository.deletePhoto).not.toHaveBeenCalled();
  });

  it("preserves publication identity and privacy while replacing public content", () => {
    const original = createPublicationSnapshot(
      readyEvent({ privacyMode: "HIDDEN_UNTIL_START" }),
    );
    const changed = readyEvent({
      title: "New title",
      slug: "new-title",
      description: "New about text",
      organizerDisplayName: "Unrelated profile edit",
      scheduleDays: [
        { date: "2026-07-25", startTime: "09:00", endTime: "15:00" },
      ],
    });
    const edited = parsePublicationSnapshot(
      editedPublicationSnapshot(original, changed),
    );
    expect(edited.projection.title).toBe("New title");
    expect(edited.projection.description).toBe("New about text");
    expect(edited.projection.scheduleDays).toHaveLength(1);
    expect(edited.projection.path).toBe(original.projection.path);
    expect(edited.projection.organizer).toEqual(original.projection.organizer);
    expect(edited.projection.address).toEqual(original.projection.address);
    expect(edited.privacyMode).toBe(original.privacyMode);
    expect(original.projection.title).toBe("Summer Estate Sale");
  });
});
