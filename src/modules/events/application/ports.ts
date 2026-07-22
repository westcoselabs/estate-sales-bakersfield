import type { AuthPrincipal } from "@/modules/auth";
import type { ValidatedLocation } from "@/modules/locations";

import type {
  AddressPrivacyMode,
  EventRecord,
  EventType,
} from "../domain/types";

export interface EventAuditContext {
  readonly requestId?: string;
}

export interface EligibleOrganizer {
  readonly id: string;
  readonly userId: string;
  readonly status: "INCOMPLETE" | "COMPLETE";
}

export interface PhotoReservationRecord {
  readonly id: string;
  readonly eventId: string;
  readonly photoId: string;
  readonly stagingObjectKey: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly sourceContentType: string | null;
  readonly expectedVersion: number;
}

export interface ReadyPhotoWrite {
  readonly sourceContentType: string;
  readonly sourceSize: number;
  readonly width: number;
  readonly height: number;
  readonly dashboardThumbnailKey: string;
  readonly listingCardKey: string;
  readonly galleryKey: string;
  readonly coverDisplayKey: string;
  readonly dashboardThumbnailHash: string;
  readonly listingCardHash: string;
  readonly galleryHash: string;
  readonly coverDisplayHash: string;
}

export interface EventRepository {
  findEligibleOrganizer(userId: string): Promise<EligibleOrganizer | null>;
  createOwned(input: {
    readonly organizerId: string;
    readonly ownerUserId: string;
    readonly eventType: EventType;
    readonly publicId: string;
    readonly slug: string;
    readonly audit: EventAuditContext;
  }): Promise<EventRecord>;
  listOwned(userId: string): Promise<readonly EventRecord[]>;
  findOwned(eventId: string, userId: string): Promise<EventRecord | null>;
  updateDetails(input: {
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly title: string | null;
    readonly description: string | null;
    readonly slug: string;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  updateSchedule(input: {
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly localStartsAt: string;
    readonly localEndsAt: string;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly timezone: string;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  updateLocation(input: {
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly location: ValidatedLocation;
    readonly privacyMode: AddressPrivacyMode;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  createPhotoReservation(input: {
    readonly reservationId: string;
    readonly photoId: string;
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly stagingObjectKey: string;
    readonly expiresAt: Date;
    readonly sourceContentType: string;
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  findPhotoReservation(input: {
    readonly reservationId: string;
    readonly photoId: string;
    readonly eventId: string;
    readonly userId: string;
  }): Promise<PhotoReservationRecord | null>;
  markPhotoProcessing(input: {
    readonly reservationId: string;
    readonly photoId: string;
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly now: Date;
  }): Promise<boolean>;
  completePhoto(input: {
    readonly reservationId: string;
    readonly photoId: string;
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly photo: ReadyPhotoWrite;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly now: Date;
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  failPhoto(input: {
    readonly reservationId: string;
    readonly photoId: string;
    readonly eventId: string;
    readonly userId: string;
    readonly errorCode: string;
    readonly now: Date;
  }): Promise<void>;
  setCover(input: {
    readonly eventId: string;
    readonly photoId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  reorderPhotos(input: {
    readonly eventId: string;
    readonly photoIds: readonly string[];
    readonly userId: string;
    readonly expectedVersion: number;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  deletePhoto(input: {
    readonly eventId: string;
    readonly photoId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly audit: EventAuditContext;
  }): Promise<{
    readonly event: EventRecord;
    readonly objectKeys: readonly string[];
  } | null>;
  approve(input: {
    readonly eventId: string;
    readonly principal: AuthPrincipal;
    readonly expectedVersion: number;
    readonly contentRevision: number;
    readonly digest: string;
    readonly termsVersion: string;
    readonly now: Date;
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  findPhotoVariantForPrincipal(input: {
    readonly photoId: string;
    readonly variant: "thumbnail" | "card" | "gallery" | "cover";
    readonly userId: string | null;
    readonly administrator: boolean;
  }): Promise<{
    readonly objectKey: string;
    readonly contentType: string;
    readonly public: boolean;
  } | null>;
}
