import { randomBytes, randomUUID } from "node:crypto";

import {
  requireAdminPrincipal,
  requireUserPrincipal,
  requireVerifiedPublishingPrincipal,
  type AuthPrincipal,
} from "@/modules/auth";
import type { LocationProvider } from "@/modules/locations";
import {
  createMediaObjectKey,
  parseMediaObjectKey,
  type ImageProcessor,
  type MediaEnvironment,
  type MediaStore,
} from "@/modules/media";

import {
  EventConflictError,
  EventNotFoundError,
  EventStateError,
  EventValidationError,
  OrganizerOnboardingRequiredError,
  PhotoProcessingError,
  type PhotoProcessingStage,
} from "../domain/errors";
import { eventSlug } from "../domain/slug";
import { validatedSchedule } from "../domain/schedule";
import type {
  EventEditorDto,
  EventListItemDto,
  EventLocationRecord,
  EventPhotoReservationDto,
  EventRecord,
  EventType,
  PublicEventProjection,
} from "../domain/types";
import { approvalDigest } from "./approval";
import type { EventAuditContext, EventRepository } from "./ports";
import {
  draftWorkflowState,
  eventReadiness,
  futurePublicEventProjection,
  PUBLISHING_TERMS_VERSION,
  publicEventProjection,
  toEventEditorDto,
} from "./policy";
import type {
  EventDetailsInput,
  EventLocationInput,
  EventScheduleInput,
} from "./schemas";

export const MAXIMUM_EVENT_PHOTO_BYTES = 15 * 1024 * 1024;
export const EVENT_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

function publicId(): string {
  return randomBytes(6).toString("hex");
}

function selectedLocationIsVerified(
  location: NonNullable<EventLocationInput["selectedLocation"]>,
): boolean {
  return (
    (location.confidence ?? 0) >= 0.9 &&
    ["building", "full_match", "match_by_building"].includes(
      location.matchType ?? "",
    )
  );
}

function pinIsNearSelectedLocation(
  selected: NonNullable<EventLocationInput["selectedLocation"]>,
  latitude: number,
  longitude: number,
): boolean {
  const latitudeDelta = (latitude - selected.latitude) * 111_111;
  const longitudeDelta =
    (longitude - selected.longitude) *
    111_111 *
    Math.cos((selected.latitude * Math.PI) / 180);
  return Math.hypot(latitudeDelta, longitudeDelta) <= 1_000;
}

const DATABASE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function withChanges(
  event: EventRecord,
  changes: Partial<EventRecord>,
): EventRecord {
  return { ...event, ...changes };
}

function listItem(event: EventRecord): EventListItemDto {
  const readiness = eventReadiness(event);
  const readyPhotos = event.photos.filter((photo) => photo.status === "READY");
  return {
    id: event.id,
    title: event.title,
    eventType: event.eventType,
    workflowState: event.workflowState,
    approvalStatus: event.approvalStatus,
    startsAt: event.startsAt?.toISOString() ?? null,
    endsAt: event.endsAt?.toISOString() ?? null,
    timezone: event.timezone,
    readyPhotoCount: readyPhotos.length,
    hasReadyCover: readyPhotos.some((photo) => photo.id === event.coverPhotoId),
    approvalReady: readiness.ready,
    version: event.version,
    updatedAt: event.updatedAt.toISOString(),
  };
}

function isExactCurrentApproval(event: EventRecord, digest: string): boolean {
  return Boolean(
    !event.publication &&
    event.workflowState === "APPROVED_FOR_PAYMENT" &&
    event.approvalStatus === "APPROVED" &&
    event.currentApprovalId &&
    event.approvedRevision === event.contentRevision &&
    event.approvalDigest === digest &&
    event.approvedAt &&
    event.termsVersion === PUBLISHING_TERMS_VERSION &&
    event.termsAcceptedAt,
  );
}

async function streamBytes(
  stream: ReadableStream<Uint8Array>,
  maximum: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new PhotoProcessingError(
        "The uploaded image is too large.",
        "source_read",
      );
    }
    chunks.push(result.value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export class EventService {
  constructor(
    private readonly events: EventRepository,
    private readonly locations: LocationProvider,
    private readonly media: MediaStore,
    private readonly images: ImageProcessor,
    private readonly environment: MediaEnvironment,
  ) {}

  private async requireOrganizer(principal: AuthPrincipal | null) {
    const user = requireUserPrincipal(principal);
    const organizer = await this.events.findEligibleOrganizer(user.id);
    if (!organizer || organizer.status !== "COMPLETE") {
      throw new OrganizerOnboardingRequiredError(
        "Complete organizer onboarding before managing event drafts.",
      );
    }
    return { user, organizer };
  }

  private async loadOwned(
    eventId: string,
    userId: string,
  ): Promise<EventRecord> {
    if (!DATABASE_ID.test(eventId)) {
      throw new EventNotFoundError("The event draft was not found.");
    }
    const event = await this.events.findOwned(eventId, userId);
    if (!event) throw new EventNotFoundError("The event draft was not found.");
    return event;
  }

  private changed(result: EventRecord | null): EventRecord {
    if (!result) throw new EventConflictError();
    return result;
  }

  private assertEditable(event: EventRecord): void {
    if (event.publication) {
      throw new EventStateError(
        "Published listings cannot be edited in the Phase 4 workflow.",
      );
    }
  }

  async create(
    principal: AuthPrincipal | null,
    eventType: EventType,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const { user, organizer } = await this.requireOrganizer(principal);
    const event = await this.events.createOwned({
      organizerId: organizer.id,
      ownerUserId: user.id,
      eventType,
      publicId: publicId(),
      slug: "sale",
      audit,
    });
    return toEventEditorDto(event);
  }

  async list(
    principal: AuthPrincipal | null,
  ): Promise<readonly EventListItemDto[]> {
    const { user } = await this.requireOrganizer(principal);
    return (await this.events.listOwned(user.id)).map(listItem);
  }

  async get(
    principal: AuthPrincipal | null,
    eventId: string,
  ): Promise<EventEditorDto> {
    const { user } = await this.requireOrganizer(principal);
    return toEventEditorDto(await this.loadOwned(eventId, user.id));
  }

  async updateDetails(
    principal: AuthPrincipal | null,
    eventId: string,
    input: EventDetailsInput,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const { user } = await this.requireOrganizer(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    const hypothetical = withChanges(current, {
      title: input.title,
      description: input.description,
      slug: eventSlug(input.title),
      approvalStatus: "NOT_APPROVED",
      coverPhotoId: current.coverPhotoId,
    });
    const result = await this.events.updateDetails({
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      title: input.title,
      description: input.description,
      slug: eventSlug(input.title),
      workflowState: draftWorkflowState(hypothetical),
      audit,
    });
    return toEventEditorDto(this.changed(result));
  }

  async updateSchedule(
    principal: AuthPrincipal | null,
    eventId: string,
    input: EventScheduleInput,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const { user } = await this.requireOrganizer(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.location && current.location.timezone !== input.timezone) {
      throw new EventValidationError(
        "The schedule timezone must match the validated address timezone.",
      );
    }
    const schedule = validatedSchedule(input);
    const hypothetical = withChanges(current, {
      localStartsAt: input.localStartsAt,
      localEndsAt: input.localEndsAt,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      timezone: input.timezone,
      approvalStatus: "NOT_APPROVED",
    });
    const result = await this.events.updateSchedule({
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      localStartsAt: input.localStartsAt,
      localEndsAt: input.localEndsAt,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      timezone: input.timezone,
      workflowState: draftWorkflowState(hypothetical),
      audit,
    });
    return toEventEditorDto(this.changed(result));
  }

  async updateLocation(
    principal: AuthPrincipal | null,
    eventId: string,
    input: EventLocationInput,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const { user } = await this.requireOrganizer(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.timezone && current.timezone !== input.timezone) {
      throw new EventValidationError(
        "The address timezone must match the saved schedule timezone.",
      );
    }
    const selected = input.confirmed ? input.selectedLocation : undefined;
    const currentLocation = current.location;
    const addressUnchanged = Boolean(
      currentLocation &&
      currentLocation.addressLine1 === input.addressLine1.trim() &&
      (currentLocation.addressLine2 ?? "") ===
        (input.addressLine2?.trim() ?? "") &&
      currentLocation.city === input.city.trim() &&
      currentLocation.region === input.region.trim() &&
      currentLocation.postalCode === input.postalCode.trim() &&
      currentLocation.countryCode === input.countryCode.trim().toUpperCase() &&
      currentLocation.timezone === input.timezone &&
      currentLocation.confirmationStatus === "CONFIRMED",
    );
    if (input.confirmed && !selected && !addressUnchanged) {
      throw new EventValidationError(
        "Choose an address suggestion and confirm the marker.",
      );
    }
    if (
      selected &&
      input.pinLatitude !== undefined &&
      input.pinLongitude !== undefined &&
      !pinIsNearSelectedLocation(selected, input.pinLatitude, input.pinLongitude)
    ) {
      throw new EventValidationError(
        "Move the pin within about 0.6 miles of the selected address, or choose a different address result.",
      );
    }
    const reusableLocation = (() => {
      if (!addressUnchanged || !currentLocation) return null;
      const { id, eventId: locationEventId, ...value } = currentLocation;
      void id;
      void locationEventId;
      return value;
    })();
    const location: Omit<EventLocationRecord, "id" | "eventId"> = selected
      ? {
          addressLine1: `${selected.houseNumber} ${selected.street}`,
          addressLine2: input.addressLine2,
          city: selected.city,
          region: selected.state,
          postalCode: selected.postalCode,
          countryCode: selected.countryCode,
          normalizedAddress: selected.formattedAddress,
          latitude: input.pinLatitude ?? selected.latitude,
          longitude: input.pinLongitude ?? selected.longitude,
          timezone: input.timezone,
          providerPlaceId: selected.id,
          providerName: selected.provider.name,
          providerVersion: selected.provider.version,
          providerAttribution: selected.provider.attribution,
          resolutionSource: "ORGANIZER_AUTOCOMPLETE",
          confirmationStatus: "CONFIRMED",
          confirmedByUserId: user.id,
          confirmedAt: new Date(),
          publicZone: "bakersfield",
          precision: selected.matchType,
          confidence: selected.confidence,
          validationStatus: selectedLocationIsVerified(selected)
            ? "VERIFIED"
            : "LOW_CONFIDENCE",
        }
      : (reusableLocation ?? {
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          region: input.region,
          postalCode: input.postalCode,
          countryCode: input.countryCode,
          normalizedAddress: [
            input.addressLine1,
            input.addressLine2,
            input.city,
            input.region,
            input.postalCode,
            input.countryCode,
          ]
            .filter(Boolean)
            .join(", "),
          latitude: null,
          longitude: null,
          timezone: input.timezone,
          providerPlaceId: null,
          providerName: null,
          providerVersion: null,
          providerAttribution: null,
          resolutionSource: "UNCONFIRMED_DRAFT",
          confirmationStatus: "UNCONFIRMED",
          confirmedByUserId: null,
          confirmedAt: null,
          publicZone: "bakersfield",
          precision: null,
          confidence: null,
          validationStatus: "UNVALIDATED",
        });
    const hypothetical = withChanges(current, {
      location: { id: "pending", eventId, ...location },
      privacyMode: input.privacyMode,
      approvalStatus: "NOT_APPROVED",
    });
    const result = await this.events.updateLocation({
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      location,
      privacyMode: input.privacyMode,
      workflowState: draftWorkflowState(hypothetical),
      audit,
    });
    return toEventEditorDto(this.changed(result));
  }

  async reservePhoto(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly expectedVersion: number;
      readonly contentType: (typeof EVENT_PHOTO_CONTENT_TYPES)[number];
    },
    audit: EventAuditContext = {},
  ): Promise<EventPhotoReservationDto> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    this.assertEditable(await this.loadOwned(eventId, user.id));
    const reservationId = randomUUID();
    const photoId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const authorization = await this.media.authorizePrivateUpload({
      scope: {
        environment: this.environment,
        resourceScope: `event-${eventId}`,
        reservationId,
        randomName: "source.bin",
      },
      allowedContentTypes: EVENT_PHOTO_CONTENT_TYPES,
      maximumSizeInBytes: MAXIMUM_EVENT_PHOTO_BYTES,
      expiresAt,
    });
    const event = this.changed(
      await this.events.createPhotoReservation({
        reservationId,
        photoId,
        eventId,
        userId: user.id,
        expectedVersion: input.expectedVersion,
        stagingObjectKey: authorization.objectKey,
        expiresAt,
        sourceContentType: input.contentType,
        audit,
      }),
    );
    const upload =
      authorization.transport === "vercel-client"
        ? ({
            transport: "vercel-client" as const,
          } as const)
        : ({
            transport: "test-direct" as const,
            uploadUrl: authorization.uploadUrl.toString(),
            method: authorization.method,
            uploadHeaders: {
              ...authorization.headers,
              "x-content-type": input.contentType,
            },
          } as const);
    return {
      event: toEventEditorDto(event),
      photoId,
      reservationId,
      uploadPathname: authorization.objectKey,
      expiresAt: authorization.expiresAt.toISOString(),
      maximumSizeInBytes: MAXIMUM_EVENT_PHOTO_BYTES,
      ...upload,
    };
  }

  async authorizePhotoUpload(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly reservationId: string;
      readonly photoId: string;
      readonly expectedVersion: number;
      readonly pathname: string;
    },
  ): Promise<{
    readonly contentType: (typeof EVENT_PHOTO_CONTENT_TYPES)[number];
    readonly maximumSizeInBytes: number;
    readonly expiresAt: Date;
  }> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.version !== input.expectedVersion)
      throw new EventConflictError();
    const reservation = await this.events.findPhotoReservation({
      reservationId: input.reservationId,
      photoId: input.photoId,
      eventId,
      userId: user.id,
    });
    if (
      !reservation ||
      reservation.consumedAt ||
      reservation.expiresAt <= new Date() ||
      !reservation.sourceContentType ||
      reservation.stagingObjectKey !== input.pathname ||
      !EVENT_PHOTO_CONTENT_TYPES.includes(
        reservation.sourceContentType as (typeof EVENT_PHOTO_CONTENT_TYPES)[number],
      )
    ) {
      throw new PhotoProcessingError(
        "The upload reservation is invalid or expired.",
        "reservation_validation",
      );
    }
    parseMediaObjectKey(input.pathname);
    return {
      contentType:
        reservation.sourceContentType as (typeof EVENT_PHOTO_CONTENT_TYPES)[number],
      maximumSizeInBytes: MAXIMUM_EVENT_PHOTO_BYTES,
      expiresAt: reservation.expiresAt,
    };
  }

  async finalizePhoto(
    principal: AuthPrincipal | null,
    eventId: string,
    photoId: string,
    input: {
      readonly reservationId: string;
      readonly expectedVersion: number;
      readonly pathname: string;
    },
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.version !== input.expectedVersion)
      throw new EventConflictError();
    const reservation = await this.events.findPhotoReservation({
      reservationId: input.reservationId,
      photoId,
      eventId,
      userId: user.id,
    });
    if (
      !reservation ||
      reservation.consumedAt ||
      reservation.expiresAt <= new Date() ||
      !reservation.sourceContentType ||
      reservation.stagingObjectKey !== input.pathname
    ) {
      throw new PhotoProcessingError(
        "The upload reservation is invalid or expired.",
        "reservation_validation",
      );
    }
    const stagingKey = parseMediaObjectKey(reservation.stagingObjectKey);
    const metadata = await this.media.inspect(stagingKey);
    if (
      !metadata ||
      metadata.size <= 0 ||
      metadata.size > MAXIMUM_EVENT_PHOTO_BYTES ||
      metadata.contentType !== reservation.sourceContentType ||
      !EVENT_PHOTO_CONTENT_TYPES.includes(
        metadata.contentType as (typeof EVENT_PHOTO_CONTENT_TYPES)[number],
      )
    ) {
      await this.events.failPhoto({
        reservationId: input.reservationId,
        photoId,
        eventId,
        userId: user.id,
        errorCode: "UPLOAD_VALIDATION_FAILED",
        now: new Date(),
      });
      await this.media.delete(stagingKey);
      throw new PhotoProcessingError(
        "The uploaded file did not pass validation.",
        "upload_validation",
      );
    }
    const marked = await this.events.markPhotoProcessing({
      reservationId: input.reservationId,
      photoId,
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      now: new Date(),
    });
    if (!marked) throw new EventConflictError();

    const finalKeys = {
      dashboardThumbnail: createMediaObjectKey({
        environment: this.environment,
        resourceScope: `event-${eventId}`,
        reservationId: photoId,
        randomName: `thumbnail-${randomUUID()}.webp`,
      }),
      listingCard: createMediaObjectKey({
        environment: this.environment,
        resourceScope: `event-${eventId}`,
        reservationId: photoId,
        randomName: `card-${randomUUID()}.webp`,
      }),
      gallery: createMediaObjectKey({
        environment: this.environment,
        resourceScope: `event-${eventId}`,
        reservationId: photoId,
        randomName: `gallery-${randomUUID()}.webp`,
      }),
      coverDisplay: createMediaObjectKey({
        environment: this.environment,
        resourceScope: `event-${eventId}`,
        reservationId: photoId,
        randomName: `cover-${randomUUID()}.webp`,
      }),
    } as const;
    const createdKeys = Object.values(finalKeys);
    let processingStage: PhotoProcessingStage = "source_read";
    try {
      const bytes = await streamBytes(
        await this.media.read(stagingKey),
        MAXIMUM_EVENT_PHOTO_BYTES,
      );
      processingStage = "image_decode";
      const processed = await this.images.process(bytes);
      processingStage = "variant_write";
      const writes = await Promise.allSettled(
        (Object.keys(finalKeys) as Array<keyof typeof finalKeys>).map((name) =>
          this.media.putPrivate(
            finalKeys[name],
            processed.variants[name].bytes,
            processed.variants[name].contentType,
          ),
        ),
      );
      if (writes.some((write) => write.status === "rejected")) {
        throw new PhotoProcessingError(
          "A sanitized image variant could not be stored.",
          "variant_write",
        );
      }
      processingStage = "variant_verify";
      const inspections = await Promise.all(
        createdKeys.map((key) => this.media.inspect(key)),
      );
      if (
        inspections.some(
          (item) =>
            !item || item.size <= 0 || item.contentType !== "image/webp",
        )
      ) {
        throw new PhotoProcessingError(
          "A sanitized image variant could not be verified.",
          "variant_verify",
        );
      }
      processingStage = "staging_cleanup";
      await this.media.delete(stagingKey);
      const hypotheticalPhoto = {
        ...current.photos.find((photo) => photo.id === photoId)!,
        status: "READY" as const,
        dashboardThumbnailKey: finalKeys.dashboardThumbnail,
        listingCardKey: finalKeys.listingCard,
        galleryKey: finalKeys.gallery,
        coverDisplayKey: finalKeys.coverDisplay,
      };
      const hypothetical = withChanges(current, {
        photos: current.photos.map((photo) =>
          photo.id === photoId ? hypotheticalPhoto : photo,
        ),
        approvalStatus: "NOT_APPROVED",
      });
      processingStage = "database_transition";
      const result = await this.events.completePhoto({
        reservationId: input.reservationId,
        photoId,
        eventId,
        userId: user.id,
        expectedVersion: input.expectedVersion + 1,
        photo: {
          sourceContentType: metadata.contentType,
          sourceSize: metadata.size,
          width: processed.width,
          height: processed.height,
          dashboardThumbnailKey: finalKeys.dashboardThumbnail,
          listingCardKey: finalKeys.listingCard,
          galleryKey: finalKeys.gallery,
          coverDisplayKey: finalKeys.coverDisplay,
          dashboardThumbnailHash: processed.variants.dashboardThumbnail.sha256,
          listingCardHash: processed.variants.listingCard.sha256,
          galleryHash: processed.variants.gallery.sha256,
          coverDisplayHash: processed.variants.coverDisplay.sha256,
        },
        workflowState: draftWorkflowState(hypothetical),
        now: new Date(),
        audit,
      });
      return toEventEditorDto(this.changed(result));
    } catch (error) {
      await Promise.allSettled([
        this.media.delete(stagingKey),
        this.media.deleteMany(createdKeys),
        this.events.failPhoto({
          reservationId: input.reservationId,
          photoId,
          eventId,
          userId: user.id,
          errorCode: "PROCESSING_FAILED",
          now: new Date(),
        }),
      ]);
      if (
        error instanceof EventConflictError ||
        error instanceof PhotoProcessingError
      ) {
        throw error;
      }
      throw new PhotoProcessingError(
        "The image could not be processed safely.",
        processingStage,
        { cause: error },
      );
    }
  }

  async setCover(
    principal: AuthPrincipal | null,
    eventId: string,
    photoId: string,
    expectedVersion: number,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    const photo = current.photos.find(
      (candidate) => candidate.id === photoId && candidate.status === "READY",
    );
    if (!photo) throw new EventValidationError("Choose a ready event photo.");
    const hypothetical = withChanges(current, {
      coverPhotoId: photoId,
      approvalStatus: "NOT_APPROVED",
    });
    return toEventEditorDto(
      this.changed(
        await this.events.setCover({
          eventId,
          photoId,
          userId: user.id,
          expectedVersion,
          workflowState: draftWorkflowState(hypothetical),
          audit,
        }),
      ),
    );
  }

  async reorderPhotos(
    principal: AuthPrincipal | null,
    eventId: string,
    photoIds: readonly string[],
    expectedVersion: number,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    const expectedIds = new Set(current.photos.map((photo) => photo.id));
    const submittedIds = new Set(photoIds);
    if (
      photoIds.length !== current.photos.length ||
      submittedIds.size !== photoIds.length ||
      [...submittedIds].some((id) => !expectedIds.has(id))
    ) {
      throw new EventValidationError(
        "Photo ordering must include each event photo once.",
      );
    }
    const order = new Map(photoIds.map((id, index) => [id, index]));
    const hypothetical = withChanges(current, {
      photos: current.photos.map((photo) => ({
        ...photo,
        sortOrder: order.get(photo.id) ?? photo.sortOrder,
      })),
      approvalStatus: "NOT_APPROVED",
    });
    return toEventEditorDto(
      this.changed(
        await this.events.reorderPhotos({
          eventId,
          photoIds,
          userId: user.id,
          expectedVersion,
          workflowState: draftWorkflowState(hypothetical),
          audit,
        }),
      ),
    );
  }

  async deletePhoto(
    principal: AuthPrincipal | null,
    eventId: string,
    photoId: string,
    expectedVersion: number,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (!current.photos.some((photo) => photo.id === photoId)) {
      throw new EventNotFoundError("The event photo was not found.");
    }
    const hypothetical = withChanges(current, {
      photos: current.photos.filter((photo) => photo.id !== photoId),
      coverPhotoId:
        current.coverPhotoId === photoId ? null : current.coverPhotoId,
      approvalStatus: "NOT_APPROVED",
    });
    const deleted = await this.events.deletePhoto({
      eventId,
      photoId,
      userId: user.id,
      expectedVersion,
      workflowState: draftWorkflowState(hypothetical),
      audit,
    });
    if (!deleted) throw new EventConflictError();
    await Promise.allSettled(
      deleted.objectKeys.map((key) =>
        this.media.delete(parseMediaObjectKey(key)),
      ),
    );
    return toEventEditorDto(deleted.event);
  }

  async preview(
    principal: AuthPrincipal | null,
    eventId: string,
    now = new Date(),
  ): Promise<PublicEventProjection> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    return publicEventProjection(await this.loadOwned(eventId, user.id), now);
  }

  async approve(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly expectedVersion: number;
      readonly acceptedTerms: true;
      readonly termsVersion: string;
    },
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireVerifiedPublishingPrincipal(principal);
    await this.requireOrganizer(user);
    if (input.termsVersion !== PUBLISHING_TERMS_VERSION) {
      throw new EventStateError(
        "The publishing terms have changed. Review them again.",
      );
    }
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.version !== input.expectedVersion)
      throw new EventConflictError();
    const projection = futurePublicEventProjection(current);
    const digest = approvalDigest(current, projection);
    if (isExactCurrentApproval(current, digest)) {
      return toEventEditorDto(current);
    }
    try {
      const approved = await this.events.approve({
        eventId,
        principal: user,
        expectedVersion: input.expectedVersion,
        contentRevision: current.contentRevision,
        digest,
        termsVersion: PUBLISHING_TERMS_VERSION,
        now: new Date(),
        audit,
      });
      if (approved) return toEventEditorDto(approved);
    } catch (error) {
      const latest = await this.loadOwned(eventId, user.id);
      if (isExactCurrentApproval(latest, digest)) {
        return toEventEditorDto(latest);
      }
      throw error;
    }
    const latest = await this.loadOwned(eventId, user.id);
    if (isExactCurrentApproval(latest, digest)) {
      return toEventEditorDto(latest);
    }
    throw new EventConflictError();
  }

  async mediaVariant(
    principal: AuthPrincipal | null,
    photoId: string,
    variant: "thumbnail" | "card" | "gallery" | "cover",
  ) {
    if (!DATABASE_ID.test(photoId)) {
      throw new EventNotFoundError("The media object was not found.");
    }
    const user = principal?.status === "ACTIVE" ? principal : null;
    const administrator =
      user?.role === "ADMIN" ? Boolean(requireAdminPrincipal(user)) : false;
    const media = await this.events.findPhotoVariantForPrincipal({
      photoId,
      variant,
      userId: user?.id ?? null,
      administrator,
    });
    if (!media) throw new EventNotFoundError("The media object was not found.");
    return {
      stream: await this.media.read(parseMediaObjectKey(media.objectKey)),
      contentType: media.contentType,
      public: media.public,
    };
  }
}
