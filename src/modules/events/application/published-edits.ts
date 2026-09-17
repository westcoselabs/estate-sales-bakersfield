import { z } from "zod";

import type { EventRecord } from "../domain/types";
import { futurePublicEventProjection } from "./policy";

const originalSnapshot = z.object({
  schema: z.literal("estate-sales-publication-v1"),
  privacyMode: z.enum([
    "EXACT_ADDRESS",
    "APPROXIMATE_LOCATION",
    "HIDDEN_UNTIL_START",
  ]),
  addressRevealAt: z.iso.datetime().nullable().optional(),
  projection: z.object({ startsAt: z.iso.datetime() }).loose(),
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
    // Legacy hidden-address publications used their original start as the
    // release instant. Freeze that effective value before allowing a schedule
    // edit so moving the sale earlier cannot expose the address early.
    ...(snapshot.privacyMode === "HIDDEN_UNTIL_START"
      ? {
          addressRevealAt:
            snapshot.addressRevealAt ?? snapshot.projection.startsAt,
        }
      : {}),
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
