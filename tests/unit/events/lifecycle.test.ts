import { describe, expect, it, vi } from "vitest";

import { EventService } from "@/modules/events/application/event-service";
import type { EventRepository } from "@/modules/events/application/ports";
import type { LocationProvider } from "@/modules/locations";
import type { ImageProcessor, MediaStore } from "@/modules/media";

function lifecycleService(
  events: EventRepository,
  media: MediaStore,
): EventService {
  return new EventService(
    events,
    {} as LocationProvider,
    media,
    {} as ImageProcessor,
    "test",
  );
}

describe("event lifecycle media purge", () => {
  it("deduplicates object keys and clears references only after deletion succeeds", async () => {
    const keys = [
      "test/event-photo/reservation-1/cover.webp",
      "test/event-photo/reservation-1/cover.webp",
      "test/event-photo/reservation-1/gallery.webp",
    ];
    const clearLifecycleMediaKeys = vi.fn(async () => undefined);
    const events = {
      findLifecycleMediaKeys: vi.fn(async () => keys),
      clearLifecycleMediaKeys,
    } as unknown as EventRepository;
    const deleteMany = vi.fn(async (requested: readonly string[]) => ({
      requested: requested.length,
      deleted: requested.length,
    }));
    const media = { deleteMany } as unknown as MediaStore;

    await lifecycleService(events, media).purgeLifecycleMedia(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(deleteMany).toHaveBeenCalledWith([
      "test/event-photo/reservation-1/cover.webp",
      "test/event-photo/reservation-1/gallery.webp",
    ]);
    expect(clearLifecycleMediaKeys).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("retains database keys so the durable job can retry provider failure", async () => {
    const clearLifecycleMediaKeys = vi.fn(async () => undefined);
    const events = {
      findLifecycleMediaKeys: vi.fn(async () => [
        "test/event-photo/reservation-1/cover.webp",
      ]),
      clearLifecycleMediaKeys,
    } as unknown as EventRepository;
    const media = {
      deleteMany: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    } as unknown as MediaStore;

    await expect(
      lifecycleService(events, media).purgeLifecycleMedia(
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toThrow("provider unavailable");
    expect(clearLifecycleMediaKeys).not.toHaveBeenCalled();
  });
});
