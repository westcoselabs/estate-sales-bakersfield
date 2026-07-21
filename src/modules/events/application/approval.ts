import { createHash } from "node:crypto";

import type { EventRecord, PublicEventProjection } from "../domain/types";

function canonicalApprovalPayload(
  event: EventRecord,
  projection: PublicEventProjection,
) {
  const photoHashes = [...event.photos]
    .filter((photo) => photo.status === "READY")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((photo) => ({
      id: photo.id,
      position: photo.sortOrder,
      dashboardThumbnailHash: photo.dashboardThumbnailHash,
      listingCardHash: photo.listingCardHash,
      galleryHash: photo.galleryHash,
      coverDisplayHash: photo.coverDisplayHash,
      isCover: photo.id === event.coverPhotoId,
    }));
  return {
    schema: "estate-sales-event-approval-v1",
    eventId: event.id,
    organizerId: event.organizerId,
    contentRevision: event.contentRevision,
    projection,
    privateLocationEvidence: event.location
      ? {
          normalizedAddress: event.location.normalizedAddress,
          latitude: event.location.latitude.toFixed(6),
          longitude: event.location.longitude.toFixed(6),
          providerName: event.location.providerName,
          providerPlaceId: event.location.providerPlaceId,
          validationStatus: event.location.validationStatus,
        }
      : null,
    photoHashes,
  };
}

export function approvalDigest(
  event: EventRecord,
  projection: PublicEventProjection,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalApprovalPayload(event, projection)), "utf8")
    .digest("hex");
}
