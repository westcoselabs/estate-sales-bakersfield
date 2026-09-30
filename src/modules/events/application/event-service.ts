import { randomBytes, randomUUID } from "node:crypto";
import { logger } from "@/platform/observability/logger";

import {
  requireSuperAdminPrincipal,
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
  EventLifecycleBlockedError,
  EventNotFoundError,
  OrganizerProfileIncompleteError,
  EventStateError,
  EventValidationError,
  PhotoProcessingError,
  type PhotoProcessingStage,
} from "../domain/errors";
import { eventSlug } from "../domain/slug";
import {
  localDateTimeToUtc,
  validatedSchedule,
  validatedScheduleDays,
} from "../domain/schedule";
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
import type { EventWorkLimiter } from "./work-limiter";
import {
  draftWorkflowState,
  eventReadiness,
  futurePublicEventProjection,
  PUBLISHING_TERMS_VERSION,
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
    canceledAt: event.canceledAt?.toISOString() ?? null,
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
    private readonly now: () => Date = () => new Date(),
    private readonly workLimiter?: EventWorkLimiter,
  ) {}

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

  private confirmationPhrase(event: EventRecord): string {
    return event.title ?? "DELETE";
  }

  private assertLifecycleConfirmation(
    event: EventRecord,
    confirmation: string,
  ): void {
    const expected = this.confirmationPhrase(event);
    const valid =
      event.title !== null
        ? confirmation === expected
        : confirmation.trim().toUpperCase() === expected;
    if (!valid) {
      throw new EventValidationError(
        event.title !== null
          ? "Type the exact event title to confirm this action."
          : "Type DELETE to confirm this action.",
      );
    }
  }

  private assertEditable(event: EventRecord, allowPublished = true): void {
    if (event.canceledAt || event.deletedAt || event.removedAt) {
      throw new EventStateError("This event is no longer editable.");
    }
    if (event.publication && event.endsAt && event.endsAt <= this.now()) {
      throw new EventStateError(
        "This event has finished. Its record is available in History.",
      );
    }
    if (event.publication && !allowPublished) {
      throw new EventStateError(
        "Published listings cannot change location or be approved for payment again.",
      );
    }
  }

  private assertPublishedReady(event: EventRecord): void {
    if (!event.publication) return;
    const readiness = eventReadiness(event);
    if (!readiness.ready)
      throw new EventValidationError(readiness.missing.join(" "));
  }

  async create(
    principal: AuthPrincipal | null,
    eventType: EventType,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireUserPrincipal(principal);
    await this.workLimiter?.consume(user.id, "create");
    const event = await this.events.createOwned({
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
    const user = requireUserPrincipal(principal);
    return (await this.events.listOwned(user.id)).map(listItem);
  }

  async get(
    principal: AuthPrincipal | null,
    eventId: string,
  ): Promise<EventEditorDto> {
    const user = requireUserPrincipal(principal);
    return toEventEditorDto(await this.loadOwned(eventId, user.id));
  }

  async validateDraftDeletion(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly expectedVersion: number;
      readonly confirmation: string;
    },
  ): Promise<void> {
    const user = requireUserPrincipal(principal);
    if (!DATABASE_ID.test(eventId)) throw new EventNotFoundError();
    const target = await this.events.findOwnedForLifecycle(eventId, user.id);
    if (!target) throw new EventNotFoundError();
    this.assertLifecycleConfirmation(target, input.confirmation);
    if (target.version !== input.expectedVersion)
      throw new EventConflictError();
    if (
      target.publication ||
      target.canceledAt ||
      target.deletedAt ||
      target.removedAt
    ) {
      throw new EventLifecycleBlockedError(
        "Only an active unpublished draft can be deleted.",
      );
    }
  }

  async deleteDraft(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly expectedVersion: number;
      readonly confirmation: string;
    },
    audit: EventAuditContext = {},
  ): Promise<{ readonly deleted: true }> {
    const user = requireUserPrincipal(principal);
    if (!DATABASE_ID.test(eventId)) throw new EventNotFoundError();
    const target = await this.events.findOwnedForLifecycle(eventId, user.id);
    if (!target) throw new EventNotFoundError();
    this.assertLifecycleConfirmation(target, input.confirmation);
    const now = this.now();
    const result = await this.events.deleteOwnedDraft({
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      now,
      mediaPurgeAt: new Date(now.getTime() + 11 * 60_000),
      audit,
    });
    if (
      result.disposition === "DELETED" ||
      result.disposition === "ALREADY_DELETED"
    ) {
      return { deleted: true };
    }
    if (result.disposition === "NOT_FOUND") throw new EventNotFoundError();
    if (result.disposition === "STALE_VERSION") throw new EventConflictError();
    if (result.disposition === "NOT_A_DRAFT") {
      throw new EventLifecycleBlockedError(
        "Published events must be canceled instead of deleted.",
      );
    }
    throw new EventLifecycleBlockedError(
      "This draft cannot be deleted while payment is being processed.",
    );
  }

  async cancelPublished(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly expectedVersion: number;
      readonly confirmation: string;
    },
    audit: EventAuditContext = {},
  ): Promise<{ readonly canceled: true }> {
    const user = requireUserPrincipal(principal);
    if (!DATABASE_ID.test(eventId)) throw new EventNotFoundError();
    const target = await this.events.findOwnedForLifecycle(eventId, user.id);
    if (!target) throw new EventNotFoundError();
    this.assertLifecycleConfirmation(target, input.confirmation);
    const now = this.now();
    const result = await this.events.cancelOwnedPublished({
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      now,
      mediaPurgeAt: new Date(now.getTime() + 11 * 60_000),
      audit,
    });
    if (
      result.disposition === "CANCELED" ||
      result.disposition === "ALREADY_CANCELED"
    ) {
      return { canceled: true };
    }
    if (result.disposition === "NOT_FOUND") throw new EventNotFoundError();
    if (result.disposition === "STALE_VERSION") throw new EventConflictError();
    if (result.disposition === "FINISHED") {
      throw new EventLifecycleBlockedError(
        "This event has finished and cannot be canceled.",
      );
    }
    if (result.disposition === "NOT_PUBLISHED") {
      throw new EventLifecycleBlockedError(
        "Only paid published events can be canceled.",
      );
    }
    throw new EventLifecycleBlockedError(
      "This event cannot be canceled while payment or publication is still being processed.",
    );
  }

  async purgeLifecycleMedia(eventId: string): Promise<void> {
    if (!DATABASE_ID.test(eventId)) {
      throw new Error("INVALID_EVENT_MEDIA_PURGE_PAYLOAD");
    }
    const keys = [
      ...new Set(await this.events.findLifecycleMediaKeys(eventId)),
    ].map(parseMediaObjectKey);
    if (keys.length > 0) await this.media.deleteMany(keys);
    await this.events.clearLifecycleMediaKeys(eventId);
  }

  async purgeExpiredPhotoReservation(reservationId: string): Promise<void> {
    if (!DATABASE_ID.test(reservationId)) {
      throw new Error("INVALID_PHOTO_RESERVATION_PURGE_PAYLOAD");
    }
    const now = this.now();
    const reservation = await this.events.findExpiredPhotoReservation({
      reservationId,
      now,
    });
    if (!reservation) return;
    await this.media.delete(parseMediaObjectKey(reservation.stagingObjectKey));
    await this.events.deleteExpiredPhotoReservation({ reservationId, now });
  }

  async purgeDeletedPhoto(photoId: string): Promise<void> {
    if (!DATABASE_ID.test(photoId)) {
      throw new Error("INVALID_PHOTO_PURGE_PAYLOAD");
    }
    const keys = (await this.events.findDeletedPhotoObjectKeys(photoId)).map(
      parseMediaObjectKey,
    );
    if (keys.length > 0) await this.media.deleteMany(keys);
    await this.events.deletePurgedPhoto(photoId);
  }

  async updateDetails(
    principal: AuthPrincipal | null,
    eventId: string,
    input: EventDetailsInput,
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.version !== input.expectedVersion)
      throw new EventConflictError();
    if (
      current.title === input.title &&
      current.description === input.description
    ) {
      return toEventEditorDto(current);
    }
    const hypothetical = withChanges(current, {
      title: input.title,
      description: input.description,
      slug: eventSlug(input.title),
      approvalStatus: "NOT_APPROVED",
      coverPhotoId: current.coverPhotoId,
    });
    this.assertPublishedReady(hypothetical);
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
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.version !== input.expectedVersion)
      throw new EventConflictError();
    const daily = input.scheduleDays
      ? validatedScheduleDays(input.scheduleDays, input.timezone)
      : null;
    const firstDay = daily?.[0];
    const lastDay = daily?.[daily.length - 1];
    const localStartsAt = firstDay
      ? `${firstDay.date}T${firstDay.startTime}`
      : input.localStartsAt;
    const localEndsAt = lastDay
      ? `${lastDay.date}T${lastDay.endTime}`
      : input.localEndsAt;
    if (!localStartsAt || !localEndsAt) {
      throw new EventValidationError(
        "Select event dates and opening and closing times.",
      );
    }
    const scheduleDays =
      daily?.map(({ date, startTime, endTime }) => ({
        date,
        startTime,
        endTime,
      })) ?? null;
    if (
      current.localStartsAt === localStartsAt &&
      current.localEndsAt === localEndsAt &&
      current.timezone === input.timezone &&
      JSON.stringify(current.scheduleDays ?? null) ===
        JSON.stringify(scheduleDays)
    ) {
      return toEventEditorDto(current);
    }
    if (current.location && current.location.timezone !== input.timezone) {
      throw new EventValidationError(
        "The schedule timezone must match the validated address timezone.",
      );
    }
    const schedule = validatedSchedule({
      localStartsAt,
      localEndsAt,
      timezone: input.timezone,
    });
    const hypothetical = withChanges(current, {
      localStartsAt,
      localEndsAt,
      scheduleDays,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      timezone: input.timezone,
      approvalStatus: "NOT_APPROVED",
    });
    this.assertPublishedReady(hypothetical);
    const result = await this.events.updateSchedule({
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      localStartsAt,
      localEndsAt,
      scheduleDays,
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
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current, false);
    if (current.version !== input.expectedVersion)
      throw new EventConflictError();
    if (current.timezone && current.timezone !== input.timezone) {
      throw new EventValidationError(
        "The address timezone must match the saved schedule timezone.",
      );
    }
    const selected = input.confirmed ? input.selectedLocation : undefined;
    const addressRevealAt =
      input.privacyMode === "HIDDEN_UNTIL_START"
        ? input.localAddressRevealAt
          ? localDateTimeToUtc(input.localAddressRevealAt, input.timezone)
          : input.localAddressRevealAt === undefined
            ? (current.addressRevealAt ?? null)
            : null
        : null;
    if (
      input.privacyMode === "HIDDEN_UNTIL_START" &&
      input.localAddressRevealAt === null
    ) {
      throw new EventValidationError(
        "Choose the date and time when the full address will be shown.",
      );
    }
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
    if (
      addressUnchanged &&
      current.privacyMode === input.privacyMode &&
      (current.addressRevealAt?.getTime() ?? null) ===
        (addressRevealAt?.getTime() ?? null)
    ) {
      return toEventEditorDto(current);
    }
    if (input.confirmed && !selected && !addressUnchanged) {
      throw new EventValidationError(
        "Select an address from the results to continue.",
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
          latitude: selected.latitude,
          longitude: selected.longitude,
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
          validationStatus: "VERIFIED",
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
      addressRevealAt,
      approvalStatus: "NOT_APPROVED",
    });
    const result = await this.events.updateLocation({
      eventId,
      userId: user.id,
      expectedVersion: input.expectedVersion,
      location,
      privacyMode: input.privacyMode,
      addressRevealAt,
      workflowState: draftWorkflowState(hypothetical),
      audit,
    });
    return toEventEditorDto(this.changed(result));
  }

  async reservePhoto(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly expectedVersion?: number | undefined;
      readonly contentType: (typeof EVENT_PHOTO_CONTENT_TYPES)[number];
      readonly clientUploadId?: string | undefined;
      readonly byteLength?: number | undefined;
    },
    audit: EventAuditContext = {},
  ): Promise<EventPhotoReservationDto> {
    const started = performance.now();
    const user = requireUserPrincipal(principal);
    this.assertEditable(await this.loadOwned(eventId, user.id));
    if (
      (input.clientUploadId && input.byteLength === undefined) ||
      (input.byteLength !== undefined &&
        (!Number.isSafeInteger(input.byteLength) ||
          input.byteLength <= 0 ||
          input.byteLength > MAXIMUM_EVENT_PHOTO_BYTES))
    )
      throw new EventValidationError(
        "An upload must include its prepared byte length.",
      );
    await this.workLimiter?.consume(user.id, "reserve");
    const reservationId = randomUUID();
    const photoId = randomUUID();
    const expiresAt = new Date(this.now().getTime() + 10 * 60_000);
    const scope = {
      environment: this.environment,
      resourceScope: `event-${eventId}`,
      reservationId,
      randomName: "source.bin",
    };
    const event = this.changed(
      await this.events.createPhotoReservation({
        reservationId,
        photoId,
        eventId,
        userId: user.id,
        expectedVersion: input.expectedVersion,
        clientUploadId: input.clientUploadId,
        byteLength: input.byteLength,
        now: this.now(),
        stagingObjectKey: createMediaObjectKey(scope),
        expiresAt,
        sourceContentType: input.contentType,
        audit,
      }),
    );
    const photo = event.photos.find((candidate) =>
      input.clientUploadId
        ? candidate.reservation?.clientUploadId === input.clientUploadId
        : candidate.id === photoId,
    );
    if (!photo?.reservation)
      throw new EventStateError("The upload reservation could not be found.");
    const reservation = photo.reservation;
    if (
      photo.status === "FAILED" ||
      (photo.status === "RESERVED" && reservation.expiresAt <= this.now())
    )
      throw new EventStateError(
        "This upload attempt has expired. Remove it and retry the photo.",
      );
    const maximumSizeInBytes =
      reservation.maximumSizeInBytes ?? MAXIMUM_EVENT_PHOTO_BYTES;
    const authorization = await this.media.authorizePrivateUpload({
      scope: { ...scope, reservationId: reservation.id },
      allowedContentTypes: [input.contentType],
      maximumSizeInBytes,
      expiresAt: reservation.expiresAt,
    });
    const upload =
      authorization.transport === "vercel-client"
        ? { transport: "vercel-client" as const }
        : {
            transport: authorization.transport,
            uploadUrl: authorization.uploadUrl.toString(),
            method: authorization.method,
            uploadHeaders: {
              ...authorization.headers,
              "x-content-type": input.contentType,
            },
          };
    logger.info(
      {
        operation: "events.reserve-photo",
        requestId: audit.requestId,
        milliseconds: Math.round(performance.now() - started),
        maximumSizeInBytes,
      },
      "Photo reserved",
    );
    return {
      event: toEventEditorDto(event),
      photoId: photo.id,
      reservationId: reservation.id,
      uploadPathname: authorization.objectKey,
      expiresAt: authorization.expiresAt.toISOString(),
      maximumSizeInBytes,
      ...upload,
    };
  }

  async authorizePhotoUpload(
    principal: AuthPrincipal | null,
    eventId: string,
    input: {
      readonly reservationId: string;
      readonly photoId: string;
      readonly expectedVersion?: number | undefined;
      readonly pathname: string;
    },
  ): Promise<{
    readonly contentType: (typeof EVENT_PHOTO_CONTENT_TYPES)[number];
    readonly maximumSizeInBytes: number;
    readonly expiresAt: Date;
  }> {
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    // Token authorization is read-only and belongs to this owner-scoped
    // reservation. Sibling uploads may have advanced the event meanwhile.
    if (
      input.expectedVersion !== undefined &&
      current.version < input.expectedVersion
    )
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
      reservation.expiresAt <= this.now() ||
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
      maximumSizeInBytes:
        reservation.maximumSizeInBytes ?? MAXIMUM_EVENT_PHOTO_BYTES,
      expiresAt: reservation.expiresAt,
    };
  }

  async inspectPhotoTransfer(
    principal: AuthPrincipal | null,
    eventId: string,
    photoId: string,
    reservationId: string,
  ) {
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (!DATABASE_ID.test(photoId) || !DATABASE_ID.test(reservationId))
      throw new EventNotFoundError("Photo not found.");
    const reservation = await this.events.findPhotoReservation({
      reservationId,
      photoId,
      eventId,
      userId: user.id,
    });
    if (!reservation) throw new EventNotFoundError("Photo not found.");
    const photo = current.photos.find((item) => item.id === photoId);
    if (
      photo?.status === "READY" ||
      (photo?.status === "PROCESSING" && reservation.expiresAt > this.now()) ||
      photo?.status === "FAILED"
    )
      return { status: photo.status, event: toEventEditorDto(current) };
    if (reservation.consumedAt || reservation.expiresAt <= this.now())
      return { status: "FAILED" as const, event: toEventEditorDto(current) };
    const metadata = await this.media.inspect(
      parseMediaObjectKey(reservation.stagingObjectKey),
    );
    const valid =
      metadata &&
      metadata.size > 0 &&
      metadata.size <=
        (reservation.maximumSizeInBytes ?? MAXIMUM_EVENT_PHOTO_BYTES) &&
      metadata.contentType === reservation.sourceContentType;
    return {
      status: valid
        ? ("UPLOADED" as const)
        : metadata
          ? ("FAILED" as const)
          : ("MISSING" as const),
      event: toEventEditorDto(current),
    };
  }

  async finalizePhoto(
    principal: AuthPrincipal | null,
    eventId: string,
    photoId: string,
    input: {
      readonly reservationId: string;
      readonly expectedVersion?: number | undefined;
      readonly pathname: string;
    },
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    const reservation = await this.events.findPhotoReservation({
      reservationId: input.reservationId,
      photoId,
      eventId,
      userId: user.id,
    });
    if (!reservation || reservation.stagingObjectKey !== input.pathname)
      throw new PhotoProcessingError(
        "The upload reservation is invalid or expired.",
        "reservation_validation",
      );
    const photo = current.photos.find((item) => item.id === photoId);
    if (
      photo?.status === "READY" ||
      (photo?.status === "PROCESSING" && reservation.expiresAt > this.now())
    )
      return toEventEditorDto(current);
    await this.workLimiter?.consume(user.id, "finalize");
    // Acquire before downloading or consuming the upload reservation. A busy
    // runtime leaves the original upload intact for a later retry.
    const release = this.workLimiter?.acquireProcessing();
    try {
      return await this.finalizePhotoWithSlot(
        principal,
        eventId,
        photoId,
        input,
        audit,
      );
    } finally {
      release?.();
    }
  }

  private async finalizePhotoWithSlot(
    principal: AuthPrincipal | null,
    eventId: string,
    photoId: string,
    input: {
      readonly reservationId: string;
      readonly expectedVersion?: number | undefined;
      readonly pathname: string;
    },
    audit: EventAuditContext = {},
  ): Promise<EventEditorDto> {
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    const reservation = await this.events.findPhotoReservation({
      reservationId: input.reservationId,
      photoId,
      eventId,
      userId: user.id,
    });
    // Another request may finish between the outer read and slot admission.
    const existing = current.photos.find((photo) => photo.id === photoId);
    if (
      reservation?.stagingObjectKey === input.pathname &&
      (existing?.status === "READY" ||
        (existing?.status === "PROCESSING" &&
          reservation.expiresAt > this.now()))
    )
      return toEventEditorDto(current);
    if (
      !reservation ||
      reservation.consumedAt ||
      reservation.expiresAt <= this.now() ||
      !reservation.sourceContentType ||
      reservation.stagingObjectKey !== input.pathname
    ) {
      throw new PhotoProcessingError(
        "The upload reservation is invalid or expired.",
        "reservation_validation",
      );
    }
    const stagingKey = parseMediaObjectKey(reservation.stagingObjectKey);
    const processingAttemptId = randomUUID();
    const marked = await this.events.markPhotoProcessing({
      reservationId: input.reservationId,
      photoId,
      eventId,
      userId: user.id,
      processingAttemptId,
      now: this.now(),
    });
    if (!marked) {
      const latest = await this.loadOwned(eventId, user.id);
      const photo = latest.photos.find((item) => item.id === photoId);
      if (photo?.status === "READY" || photo?.status === "PROCESSING")
        return toEventEditorDto(latest);
      throw new EventConflictError();
    }

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
    const timings: Record<string, number> = {};
    const started = performance.now();
    let stageStarted = started;
    const stage = (name: string) => {
      timings[name] = Math.round(performance.now() - stageStarted);
      stageStarted = performance.now();
    };
    let processingStage: PhotoProcessingStage = "upload_validation";
    try {
      const maximumSize =
        reservation.maximumSizeInBytes ?? MAXIMUM_EVENT_PHOTO_BYTES;
      const metadata = await this.media.inspect(stagingKey);
      if (
        !metadata ||
        metadata.size <= 0 ||
        metadata.size > maximumSize ||
        metadata.contentType !== reservation.sourceContentType ||
        !EVENT_PHOTO_CONTENT_TYPES.includes(
          metadata.contentType as (typeof EVENT_PHOTO_CONTENT_TYPES)[number],
        )
      )
        throw new PhotoProcessingError(
          "The uploaded file did not pass validation.",
          "upload_validation",
        );
      stage("validation");
      processingStage = "source_read";
      const bytes = await streamBytes(
        await this.media.read(stagingKey),
        maximumSize,
      );
      stage("sourceRead");
      processingStage = "image_decode";
      const processed = await this.images.process(bytes);
      stage("imageProcessing");
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
      stage("variantWrite");
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
      stage("variantVerification");
      processingStage = "staging_cleanup";
      await this.media.delete(stagingKey);
      stage("sourceDeletion");
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
        processingAttemptId,
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
        now: this.now(),
        audit,
      });
      const completed = toEventEditorDto(this.changed(result));
      stage("commit");
      logger.info(
        {
          operation: "events.finalize-photo-timing",
          requestId: audit.requestId,
          photoId,
          inputBytes: metadata.size,
          timings,
          totalMs: Math.round(performance.now() - started),
        },
        "Photo ready",
      );
      return completed;
    } catch (error) {
      await Promise.allSettled([
        this.media.delete(stagingKey),
        this.media.deleteMany(createdKeys),
        this.events.failPhoto({
          reservationId: input.reservationId,
          photoId,
          eventId,
          userId: user.id,
          processingAttemptId,
          errorCode: "PROCESSING_FAILED",
          now: this.now(),
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
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.version !== expectedVersion) throw new EventConflictError();
    const photo = current.photos.find(
      (candidate) => candidate.id === photoId && candidate.status === "READY",
    );
    if (!photo) throw new EventValidationError("Choose a ready event photo.");
    if (current.coverPhotoId === photoId) return toEventEditorDto(current);
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
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (current.version !== expectedVersion) throw new EventConflictError();
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
    if (current.photos.every((photo, index) => photo.id === photoIds[index])) {
      return toEventEditorDto(current);
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
    cleanupNow = false,
  ): Promise<EventEditorDto> {
    const user = requireUserPrincipal(principal);
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current);
    if (!current.photos.some((photo) => photo.id === photoId)) {
      throw new EventNotFoundError("The event photo was not found.");
    }
    if (cleanupNow) {
      const photo = current.photos.find((item) => item.id === photoId)!;
      if (photo.status === "READY")
        throw new EventStateError(
          "A ready photo cannot be removed by an upload retry.",
        );
      if (photo.errorCode === "MEDIA_DELETION_PENDING") {
        await this.purgeDeletedPhoto(photoId);
        return toEventEditorDto(await this.loadOwned(eventId, user.id));
      }
    }
    if (current.publication && current.coverPhotoId === photoId) {
      throw new EventValidationError(
        "Choose another cover photo before removing the current cover.",
      );
    }
    const hypothetical = withChanges(current, {
      photos: current.photos.filter((photo) => photo.id !== photoId),
      coverPhotoId:
        current.coverPhotoId === photoId ? null : current.coverPhotoId,
      approvalStatus: "NOT_APPROVED",
    });
    this.assertPublishedReady(hypothetical);
    const deleted = await this.events.deletePhoto({
      eventId,
      photoId,
      userId: user.id,
      expectedVersion,
      workflowState: draftWorkflowState(hypothetical),
      now: this.now(),
      audit,
    });
    if (!deleted) throw new EventConflictError();
    if (cleanupNow) {
      // Keep the durable purge as a fallback, but free the failed slot before
      // reserving its replacement in an otherwise full 150-photo batch.
      await this.purgeDeletedPhoto(photoId);
      return toEventEditorDto(await this.loadOwned(eventId, user.id));
    }
    return toEventEditorDto(deleted);
  }

  async preview(
    principal: AuthPrincipal | null,
    eventId: string,
  ): Promise<PublicEventProjection> {
    const user = requireUserPrincipal(principal);
    return futurePublicEventProjection(await this.loadOwned(eventId, user.id));
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
    if (input.termsVersion !== PUBLISHING_TERMS_VERSION) {
      throw new EventStateError(
        "The publishing terms have changed. Review them again.",
      );
    }
    const current = await this.loadOwned(eventId, user.id);
    this.assertEditable(current, false);
    if (current.organizerStatus !== "COMPLETE") {
      throw new OrganizerProfileIncompleteError(
        "Complete your organizer profile before approving this event.",
      );
    }
    if (
      current.photos.some((photo) =>
        ["RESERVED", "UPLOADED", "PROCESSING"].includes(photo.status),
      )
    ) {
      throw new EventStateError(
        "Wait for all photo uploads to finish before approving this event.",
      );
    }
    const now = this.now();
    if (!current.startsAt || current.startsAt.getTime() <= now.getTime()) {
      throw new EventStateError(
        "The event must start in the future before it can be approved.",
      );
    }
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
        now,
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
      user?.role === "SUPER_ADMIN"
        ? Boolean(requireSuperAdminPrincipal(user))
        : false;
    const now = this.now();
    const media = await this.events.findPhotoVariantForPrincipal({
      photoId,
      variant,
      userId: user?.id ?? null,
      administrator,
      now,
    });
    if (!media) throw new EventNotFoundError("The media object was not found.");
    return {
      stream: await this.media.read(parseMediaObjectKey(media.objectKey)),
      contentType: media.contentType,
      public: media.public,
      publicCacheSeconds:
        media.public && media.publicUntil
          ? Math.max(
              0,
              Math.min(
                300,
                Math.floor(
                  (media.publicUntil.getTime() - now.getTime()) / 1_000,
                ),
              ),
            )
          : 0,
    };
  }
}
