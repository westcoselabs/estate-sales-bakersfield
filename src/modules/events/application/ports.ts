import type { AuthPrincipal } from "@/modules/auth";

import type {
  AddressPrivacyMode,
  EventLocationRecord,
  EventRecord,
  EventType,
} from "../domain/types";

export interface EventAuditContext {
  readonly requestId?: string;
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
  createOwned(input: {
    readonly ownerUserId: string;
    readonly eventType: EventType;
    readonly publicId: string;
    readonly slug: string;
    readonly audit: EventAuditContext;
  }): Promise<EventRecord>;
  listOwned(userId: string): Promise<readonly EventRecord[]>;
  findOwned(eventId: string, userId: string): Promise<EventRecord | null>;
  findOwnedForLifecycle(
    eventId: string,
    userId: string,
  ): Promise<EventRecord | null>;
  deleteOwnedDraft(input: {
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly now: Date;
    readonly mediaPurgeAt: Date;
    readonly audit: EventAuditContext;
  }): Promise<
    | { readonly disposition: "DELETED" | "ALREADY_DELETED" }
    | {
        readonly disposition:
          "NOT_FOUND" | "STALE_VERSION" | "NOT_A_DRAFT" | "PAYMENT_BLOCKED";
      }
  >;
  cancelOwnedPublished(input: {
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly now: Date;
    readonly mediaPurgeAt: Date;
    readonly audit: EventAuditContext;
  }): Promise<
    | { readonly disposition: "CANCELED" | "ALREADY_CANCELED" }
    | {
        readonly disposition:
          "NOT_FOUND" | "STALE_VERSION" | "NOT_PUBLISHED" | "PAYMENT_BLOCKED";
      }
  >;
  findLifecycleMediaKeys(eventId: string): Promise<readonly string[]>;
  clearLifecycleMediaKeys(eventId: string): Promise<void>;
  findExpiredPhotoReservation(input: {
    readonly reservationId: string;
    readonly now: Date;
  }): Promise<{
    readonly photoId: string;
    readonly stagingObjectKey: string;
  } | null>;
  deleteExpiredPhotoReservation(input: {
    readonly reservationId: string;
    readonly now: Date;
  }): Promise<void>;
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
    readonly location: Omit<EventLocationRecord, "id" | "eventId">;
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
    readonly now: Date;
    readonly audit: EventAuditContext;
  }): Promise<EventRecord | null>;
  findDeletedPhotoObjectKeys(photoId: string): Promise<readonly string[]>;
  deletePurgedPhoto(photoId: string): Promise<void>;
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
    readonly now: Date;
  }): Promise<{
    readonly objectKey: string;
    readonly contentType: string;
    readonly public: boolean;
    readonly publicUntil: Date | null;
  } | null>;
}
