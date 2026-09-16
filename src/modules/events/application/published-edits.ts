import { z } from "zod";

import type { EventRecord } from "../domain/types";
import { futurePublicEventProjection } from "./policy";

const originalSnapshot = z.object({
  schema: z.literal("estate-sales-publication-v1"),
  privacyMode: z.string(),
  addressRevealAt: z.string().nullable().optional(),
  projection: z.record(z.string(), z.unknown()),
});

/** Only editable content changes; paid identity, address and organizer stay fixed. */
export function editedPublicationSnapshot(
  original: unknown,
  event: EventRecord,
) {
  const snapshot = originalSnapshot.parse(original);
  const projection = futurePublicEventProjection(event);
  return {
    ...snapshot,
    projection: {
      ...snapshot.projection,
      title: projection.title,
      description: projection.description,
      startsAt: projection.startsAt,
      endsAt: projection.endsAt,
      localStartsAt: projection.localStartsAt,
      localEndsAt: projection.localEndsAt,
      timezone: projection.timezone,
      scheduleDays: projection.scheduleDays ?? [],
      coverPhotoUrl: projection.coverPhotoUrl,
      gallery: projection.gallery,
    },
  };
}
