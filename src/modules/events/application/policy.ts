import { EventStateError } from "../domain/errors";
import { futurePublicPath } from "../domain/slug";
import type {
  EventEditorDto,
  EventPhotoDto,
  EventReadiness,
  EventStepReadiness,
  EventRecord,
  PublicAddressProjection,
  PublicEventProjection,
} from "../domain/types";

export const PUBLISHING_TERMS_VERSION = "2026-07-phase3-v1";

const STREET_SUFFIXES: Readonly<Record<string, string>> = {
  avenue: "ave",
  boulevard: "blvd",
  circle: "cir",
  court: "ct",
  drive: "dr",
  highway: "hwy",
  lane: "ln",
  parkway: "pkwy",
  place: "pl",
  road: "rd",
  street: "st",
  terrace: "ter",
  trail: "trl",
  way: "way",
};

function normalizedAddressText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .trim()
    .split(/\s+/)
    .map((part) => STREET_SUFFIXES[part] ?? part)
    .join(" ")
    .replace(/\b(?:apartment|apt|unit|suite|ste|#)\s*[a-z0-9-]+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function privateAddressLeakFields(
  event: Pick<
    EventRecord,
    "title" | "description" | "privacyMode" | "location"
  >,
): readonly ("title" | "description")[] {
  if (event.privacyMode === "EXACT_ADDRESS" || !event.location?.addressLine1) {
    return [];
  }
  const address = normalizedAddressText(event.location.addressLine1);
  const [houseNumber, ...streetParts] = address.split(" ");
  if (!/^\d+[a-z]?$/.test(houseNumber ?? "") || streetParts.length === 0) {
    return [];
  }
  const needle = [houseNumber, ...streetParts].join(" ");
  return (["title", "description"] as const).filter((field) => {
    const value = event[field];
    if (!value) return false;
    const normalized = normalizedAddressText(value);
    return (
      normalized === needle ||
      normalized.startsWith(`${needle} `) ||
      normalized.endsWith(` ${needle}`) ||
      normalized.includes(` ${needle} `)
    );
  });
}

function hasConfirmedProviderLocation(event: EventRecord): boolean {
  const location = event.location;
  return Boolean(
    location &&
    location.confirmationStatus === "CONFIRMED" &&
    location.providerPlaceId &&
    location.providerName &&
    location.latitude !== null &&
    Number.isFinite(location.latitude) &&
    location.longitude !== null &&
    Number.isFinite(location.longitude),
  );
}

function safePublicWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function eventReadiness(event: EventRecord): EventReadiness {
  const missing: string[] = [];
  if (!event.title) missing.push("Add an event title.");
  if (!event.description) missing.push("Add an event description.");
  for (const field of privateAddressLeakFields(event)) {
    missing.push(
      field === "title"
        ? "Remove the private street address from the title."
        : "Remove the private street address from the description.",
    );
  }
  if (
    !event.localStartsAt ||
    !event.localEndsAt ||
    !event.startsAt ||
    !event.endsAt ||
    !event.timezone
  ) {
    missing.push("Add a valid schedule and timezone.");
  }
  if (!hasConfirmedProviderLocation(event)) {
    missing.push("Select and confirm the event address.");
  }
  if (!event.privacyMode) missing.push("Choose an address-privacy policy.");
  const readyPhotos = event.photos.filter((photo) => photo.status === "READY");
  if (readyPhotos.length === 0)
    missing.push("Add at least one photo to continue.");
  if (
    !event.coverPhotoId ||
    !readyPhotos.some((photo) => photo.id === event.coverPhotoId)
  ) {
    missing.push("Choose a cover photo.");
  }
  if (event.canceledAt) missing.push("Canceled events cannot be approved.");
  if (event.deletedAt) missing.push("Deleted drafts cannot be approved.");
  if (event.removedAt) missing.push("Removed events cannot be approved.");
  return { ready: missing.length === 0, missing };
}

export function eventStepReadiness(event: EventRecord): EventStepReadiness {
  const detailsComplete = Boolean(
    event.title &&
    event.description &&
    privateAddressLeakFields(event).length === 0,
  );
  const scheduleComplete = Boolean(
    event.localStartsAt &&
    event.localEndsAt &&
    event.startsAt &&
    event.endsAt &&
    event.timezone,
  );
  const locationComplete = Boolean(
    hasConfirmedProviderLocation(event) && event.privacyMode,
  );
  const readyPhotos = event.photos.filter((photo) => photo.status === "READY");
  const photosComplete = Boolean(
    readyPhotos.length > 0 &&
    event.coverPhotoId &&
    readyPhotos.some((photo) => photo.id === event.coverPhotoId),
  );
  return {
    detailsComplete,
    scheduleComplete,
    locationComplete,
    photosComplete,
    reviewReady:
      detailsComplete &&
      scheduleComplete &&
      locationComplete &&
      photosComplete &&
      !event.canceledAt &&
      !event.deletedAt &&
      !event.removedAt,
  };
}

export function draftWorkflowState(
  event: EventRecord,
): "INCOMPLETE_DRAFT" | "PREVIEW_READY" {
  return eventReadiness(event).ready ? "PREVIEW_READY" : "INCOMPLETE_DRAFT";
}

function photoDto(event: EventRecord): EventPhotoDto[] {
  return [...event.photos]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((photo) => ({
      id: photo.id,
      status: photo.status,
      sortOrder: photo.sortOrder,
      isCover: event.coverPhotoId === photo.id,
      width: photo.width,
      height: photo.height,
      errorCode: photo.errorCode,
      urls: {
        thumbnail: `/media/${photo.id}/thumbnail`,
        card: `/media/${photo.id}/card`,
        gallery: `/media/${photo.id}/gallery`,
        cover: `/media/${photo.id}/cover`,
      },
    }));
}

export function toEventEditorDto(event: EventRecord): EventEditorDto {
  return {
    id: event.id,
    publicId: event.publicId,
    futurePublicPath: futurePublicPath(event),
    slug: event.slug,
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    localStartsAt: event.localStartsAt,
    localEndsAt: event.localEndsAt,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
    timezone: event.timezone,
    privacyMode: event.privacyMode,
    workflowState: event.workflowState,
    approvalStatus: event.approvalStatus,
    version: event.version,
    contentRevision: event.contentRevision,
    approvedRevision: event.approvedRevision,
    approvalDigest: event.approvalDigest,
    approvedAt: event.approvedAt?.toISOString() ?? null,
    termsVersion: event.termsVersion,
    termsAcceptedAt: event.termsAcceptedAt?.toISOString() ?? null,
    publication: event.publication
      ? {
          canonicalPath: event.publication.canonicalPath,
          publishedAt: event.publication.publishedAt.toISOString(),
        }
      : null,
    location: event.location
      ? {
          addressLine1: event.location.addressLine1,
          addressLine2: event.location.addressLine2,
          city: event.location.city,
          region: event.location.region,
          postalCode: event.location.postalCode,
          countryCode: event.location.countryCode,
          normalizedAddress: event.location.normalizedAddress,
          timezone: event.location.timezone,
          validationStatus: event.location.validationStatus,
          confirmationStatus: event.location.confirmationStatus,
          precision: event.location.precision,
          latitude: event.location.latitude,
          longitude: event.location.longitude,
          providerAttribution: event.location.providerAttribution,
        }
      : null,
    photos: photoDto(event),
    readiness: eventReadiness(event),
    steps: eventStepReadiness(event),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function addressProjection(
  event: EventRecord,
  now: Date,
): PublicAddressProjection {
  if (!event.location || !event.privacyMode || !event.startsAt) {
    throw new EventStateError(
      "The event does not have a publishable location.",
    );
  }
  const location = event.location;
  if (event.privacyMode === "APPROXIMATE_LOCATION") {
    return {
      kind: "APPROXIMATE",
      city: location.city,
      region: location.region,
      countryCode: location.countryCode,
      label: `Near ${location.city}, ${location.region}`,
    };
  }
  if (
    event.privacyMode === "HIDDEN_UNTIL_START" &&
    now.getTime() < event.startsAt.getTime()
  ) {
    return {
      kind: "HIDDEN",
      city: location.city,
      region: location.region,
      countryCode: location.countryCode,
      releasesAt: event.startsAt.toISOString(),
    };
  }
  return {
    kind: "EXACT",
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    region: location.region,
    postalCode: location.postalCode,
    countryCode: location.countryCode,
  };
}

export function publicEventProjection(
  event: EventRecord,
  now: Date,
): PublicEventProjection {
  const readiness = eventReadiness(event);
  if (!readiness.ready) {
    throw new EventStateError(
      "The event is incomplete and cannot be previewed.",
    );
  }
  const cover = event.photos.find(
    (photo) => photo.id === event.coverPhotoId && photo.status === "READY",
  );
  if (
    !cover ||
    !event.title ||
    !event.description ||
    !event.startsAt ||
    !event.endsAt ||
    !event.timezone ||
    !event.localStartsAt ||
    !event.localEndsAt
  ) {
    throw new EventStateError("The preview requirements are not satisfied.");
  }
  return {
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    path: futurePublicPath(event),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timezone: event.timezone,
    localStartsAt: event.localStartsAt,
    localEndsAt: event.localEndsAt,
    address: addressProjection(event, now),
    organizer: {
      displayName: event.organizerDisplayName,
      websiteUrl: safePublicWebsite(event.organizerWebsiteUrl),
    },
    coverPhotoUrl: `/media/${cover.id}/cover`,
    gallery: event.photos
      .filter((photo) => photo.status === "READY")
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((photo, position) => ({
        id: photo.id,
        url: `/media/${photo.id}/gallery`,
        position,
      })),
  };
}

export function futurePublicEventProjection(
  event: EventRecord,
): PublicEventProjection {
  if (!event.startsAt) {
    throw new EventStateError("The event schedule is incomplete.");
  }
  return publicEventProjection(event, event.startsAt);
}
