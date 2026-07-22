export type EventType = "ESTATE_SALE" | "YARD_SALE";
export type AddressPrivacyMode =
  "EXACT_ADDRESS" | "APPROXIMATE_LOCATION" | "HIDDEN_UNTIL_START";
export type EventWorkflowState =
  "INCOMPLETE_DRAFT" | "PREVIEW_READY" | "APPROVED_FOR_PAYMENT";
export type EventApprovalStatus = "NOT_APPROVED" | "APPROVED";
export type LocationValidationStatus =
  "UNVALIDATED" | "VERIFIED" | "LOW_CONFIDENCE";
export type EventPhotoStatus =
  "RESERVED" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export type EventPhotoVariant = "thumbnail" | "card" | "gallery" | "cover";
export type EventOrigin = "OWNER_CREATED" | "ADMIN_IMPORTED" | "PARTNER_FEED";

export interface EventLocationRecord {
  readonly id: string;
  readonly eventId: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly normalizedAddress: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly providerPlaceId: string;
  readonly providerName: string;
  readonly precision: string | null;
  readonly confidence: number | null;
  readonly validationStatus: LocationValidationStatus;
}

export interface EventPhotoRecord {
  readonly id: string;
  readonly eventId: string;
  readonly status: EventPhotoStatus;
  readonly sortOrder: number;
  readonly stagingObjectKey: string | null;
  readonly dashboardThumbnailKey: string | null;
  readonly listingCardKey: string | null;
  readonly galleryKey: string | null;
  readonly coverDisplayKey: string | null;
  readonly dashboardThumbnailHash: string | null;
  readonly listingCardHash: string | null;
  readonly galleryHash: string | null;
  readonly coverDisplayHash: string | null;
  readonly sourceContentType: string | null;
  readonly sourceSize: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly errorCode: string | null;
  readonly readyAt: Date | null;
  readonly reservation: {
    readonly id: string;
    readonly expiresAt: Date;
    readonly consumedAt: Date | null;
  } | null;
}

export interface EventRecord {
  readonly id: string;
  readonly organizerId: string;
  readonly ownerUserId: string;
  readonly organizerDisplayName: string;
  readonly organizerWebsiteUrl: string | null;
  readonly publicId: string;
  readonly slug: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly eventType: EventType;
  readonly origin: EventOrigin;
  readonly localStartsAt: string | null;
  readonly localEndsAt: string | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly timezone: string | null;
  readonly privacyMode: AddressPrivacyMode | null;
  readonly workflowState: EventWorkflowState;
  readonly approvalStatus: EventApprovalStatus;
  readonly version: number;
  readonly contentRevision: number;
  readonly approvedRevision: number | null;
  readonly approvalDigest: string | null;
  readonly approvedAt: Date | null;
  readonly termsVersion: string | null;
  readonly termsAcceptedAt: Date | null;
  readonly currentApprovalId: string | null;
  readonly coverPhotoId: string | null;
  readonly canceledAt: Date | null;
  readonly removedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publication: {
    readonly paymentAttemptId: string;
    readonly approvedRevision: number;
    readonly approvalDigest: string;
    readonly canonicalPath: string;
    readonly publishedAt: Date;
  } | null;
  readonly location: EventLocationRecord | null;
  readonly photos: readonly EventPhotoRecord[];
}

export interface EventListItemDto {
  readonly id: string;
  readonly title: string | null;
  readonly eventType: EventType;
  readonly workflowState: EventWorkflowState;
  readonly approvalStatus: EventApprovalStatus;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly timezone: string | null;
  readonly readyPhotoCount: number;
  readonly hasReadyCover: boolean;
  readonly approvalReady: boolean;
  readonly version: number;
  readonly updatedAt: string;
}

export interface EventPhotoDto {
  readonly id: string;
  readonly status: EventPhotoStatus;
  readonly sortOrder: number;
  readonly isCover: boolean;
  readonly width: number | null;
  readonly height: number | null;
  readonly errorCode: string | null;
  readonly urls: {
    readonly thumbnail: string;
    readonly card: string;
    readonly gallery: string;
    readonly cover: string;
  };
}

interface EventPhotoReservationBaseDto {
  readonly event: EventEditorDto;
  readonly photoId: string;
  readonly reservationId: string;
  readonly uploadPathname: string;
  readonly expiresAt: string;
  readonly maximumSizeInBytes: number;
}

export interface VercelClientPhotoReservationDto extends EventPhotoReservationBaseDto {
  readonly transport: "vercel-client";
}

export interface TestDirectPhotoReservationDto extends EventPhotoReservationBaseDto {
  readonly transport: "test-direct";
  readonly uploadUrl: string;
  readonly method: "PUT";
  readonly uploadHeaders: Readonly<Record<string, string>>;
}

export type EventPhotoReservationDto =
  VercelClientPhotoReservationDto | TestDirectPhotoReservationDto;

export interface EventEditorDto {
  readonly id: string;
  readonly publicId: string;
  readonly futurePublicPath: string;
  readonly slug: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly eventType: EventType;
  readonly localStartsAt: string | null;
  readonly localEndsAt: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly timezone: string | null;
  readonly privacyMode: AddressPrivacyMode | null;
  readonly workflowState: EventWorkflowState;
  readonly approvalStatus: EventApprovalStatus;
  readonly version: number;
  readonly contentRevision: number;
  readonly approvedRevision: number | null;
  readonly approvalDigest: string | null;
  readonly approvedAt: string | null;
  readonly termsVersion: string | null;
  readonly termsAcceptedAt: string | null;
  readonly location: {
    readonly addressLine1: string;
    readonly addressLine2: string | null;
    readonly city: string;
    readonly region: string;
    readonly postalCode: string;
    readonly countryCode: string;
    readonly normalizedAddress: string;
    readonly timezone: string;
    readonly validationStatus: LocationValidationStatus;
    readonly precision: string | null;
  } | null;
  readonly photos: readonly EventPhotoDto[];
  readonly readiness: EventReadiness;
  readonly steps: EventStepReadiness;
  readonly updatedAt: string;
}

export interface EventStepReadiness {
  readonly detailsComplete: boolean;
  readonly scheduleComplete: boolean;
  readonly locationComplete: boolean;
  readonly photosComplete: boolean;
  readonly reviewReady: boolean;
}

export interface EventReadiness {
  readonly ready: boolean;
  readonly missing: readonly string[];
}

export type PublicAddressProjection =
  | {
      readonly kind: "EXACT";
      readonly addressLine1: string;
      readonly addressLine2: string | null;
      readonly city: string;
      readonly region: string;
      readonly postalCode: string;
      readonly countryCode: string;
    }
  | {
      readonly kind: "APPROXIMATE";
      readonly city: string;
      readonly region: string;
      readonly countryCode: string;
      readonly label: string;
    }
  | {
      readonly kind: "HIDDEN";
      readonly city: string;
      readonly region: string;
      readonly countryCode: string;
      readonly releasesAt: string;
    };

export interface PublicEventProjection {
  readonly title: string;
  readonly description: string;
  readonly eventType: EventType;
  readonly path: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly address: PublicAddressProjection;
  readonly organizer: {
    readonly displayName: string;
    readonly websiteUrl: string | null;
  };
  readonly coverPhotoUrl: string;
  readonly gallery: ReadonlyArray<{
    readonly id: string;
    readonly url: string;
    readonly position: number;
  }>;
}
