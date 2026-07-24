import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import type { EventRepository } from "../application/ports";
import type {
  EventLocationRecord,
  EventPhotoRecord,
  EventRecord,
} from "../domain/types";

const eventInclude = {
  organizer: {
    select: {
      userId: true,
      displayName: true,
      websiteUrl: true,
    },
  },
  location: true,
  photos: {
    include: { uploadReservation: true },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
  publication: {
    select: {
      paymentAttemptId: true,
      approvedRevision: true,
      approvalDigest: true,
      canonicalPath: true,
      publishedAt: true,
    },
  },
} satisfies Prisma.EventInclude;

type EventPayload = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

function mapLocation(
  location: EventPayload["location"],
): EventLocationRecord | null {
  if (!location) return null;
  return {
    id: location.id,
    eventId: location.eventId,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    region: location.region,
    postalCode: location.postalCode,
    countryCode: location.countryCode,
    normalizedAddress: location.normalizedAddress,
    latitude: location.latitude === null ? null : Number(location.latitude),
    longitude: location.longitude === null ? null : Number(location.longitude),
    timezone: location.timezone,
    providerPlaceId: location.providerPlaceId,
    providerName: location.providerName,
    providerVersion: location.providerVersion,
    providerAttribution: location.providerAttribution,
    resolutionSource: location.resolutionSource,
    confirmationStatus: location.confirmationStatus,
    confirmedByUserId: location.confirmedByUserId,
    confirmedAt: location.confirmedAt,
    publicZone: location.publicZone,
    precision: location.precision,
    confidence:
      location.confidence === null ? null : Number(location.confidence),
    validationStatus: location.validationStatus,
  };
}

function mapPhoto(photo: EventPayload["photos"][number]): EventPhotoRecord {
  return {
    id: photo.id,
    eventId: photo.eventId,
    status: photo.status,
    sortOrder: photo.sortOrder,
    stagingObjectKey: photo.stagingObjectKey,
    dashboardThumbnailKey: photo.dashboardThumbnailKey,
    listingCardKey: photo.listingCardKey,
    galleryKey: photo.galleryKey,
    coverDisplayKey: photo.coverDisplayKey,
    dashboardThumbnailHash: photo.dashboardThumbnailHash,
    listingCardHash: photo.listingCardHash,
    galleryHash: photo.galleryHash,
    coverDisplayHash: photo.coverDisplayHash,
    sourceContentType: photo.sourceContentType,
    sourceSize: photo.sourceSize,
    width: photo.width,
    height: photo.height,
    errorCode: photo.errorCode,
    readyAt: photo.readyAt,
    reservation: photo.uploadReservation
      ? {
          id: photo.uploadReservation.id,
          expiresAt: photo.uploadReservation.expiresAt,
          consumedAt: photo.uploadReservation.consumedAt,
        }
      : null,
  };
}

function mapEvent(event: EventPayload): EventRecord {
  return {
    id: event.id,
    organizerId: event.organizerId,
    ownerUserId: event.organizer.userId,
    organizerDisplayName: event.organizer.displayName ?? "Organizer",
    organizerWebsiteUrl: event.organizer.websiteUrl,
    publicId: event.publicId,
    slug: event.slug,
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    origin: event.origin,
    localStartsAt: event.localStartsAt,
    localEndsAt: event.localEndsAt,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    privacyMode: event.privacyMode,
    workflowState: event.workflowState,
    approvalStatus: event.approvalStatus,
    version: event.version,
    contentRevision: event.contentRevision,
    approvedRevision: event.approvedRevision,
    approvalDigest: event.approvalDigest,
    approvedAt: event.approvedAt,
    termsVersion: event.termsVersion,
    termsAcceptedAt: event.termsAcceptedAt,
    currentApprovalId: event.currentApprovalId,
    coverPhotoId: event.coverPhotoId,
    canceledAt: event.canceledAt,
    removedAt: event.removedAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    publication: event.publication,
    location: mapLocation(event.location),
    photos: event.photos.map(mapPhoto),
  };
}

const invalidatedApproval = {
  approvalStatus: "NOT_APPROVED" as const,
  approvedRevision: null,
  approvalDigest: null,
  approvedAt: null,
  termsVersion: null,
  termsAcceptedAt: null,
  termsAcceptedByUserId: null,
  currentApprovalId: null,
};

function auditData(input: {
  readonly userId: string;
  readonly action: string;
  readonly eventId: string;
  readonly requestId?: string | undefined;
  readonly metadata?: Prisma.InputJsonValue | undefined;
}) {
  return {
    actorUserId: input.userId,
    action: input.action,
    targetType: "EVENT",
    targetId: input.eventId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    metadata: input.metadata ?? {},
  };
}

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async findOwnedWith(
    client: Prisma.TransactionClient | PrismaClient,
    eventId: string,
    userId: string,
  ): Promise<EventRecord | null> {
    const event = await client.event.findFirst({
      where: { id: eventId, organizer: { userId } },
      include: eventInclude,
    });
    return event ? mapEvent(event) : null;
  }

  async findEligibleOrganizer(userId: string) {
    return this.prisma.organizerProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true, status: true },
    });
  }

  async createOwned(input: Parameters<EventRepository["createOwned"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const organizer = await transaction.organizerProfile.findFirst({
        where: {
          id: input.organizerId,
          userId: input.ownerUserId,
          status: "COMPLETE",
        },
        select: { id: true },
      });
      if (!organizer)
        throw new Error("Eligible organizer ownership is required");
      const event = await transaction.event.create({
        data: {
          organizerId: input.organizerId,
          eventType: input.eventType,
          publicId: input.publicId,
          slug: input.slug,
        },
        include: eventInclude,
      });
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.ownerUserId,
          action: "EVENT_DRAFT_CREATED",
          eventId: event.id,
          requestId: input.audit.requestId,
          metadata: { eventType: input.eventType },
        }),
      });
      return mapEvent(event);
    });
  }

  async listOwned(userId: string) {
    const events = await this.prisma.event.findMany({
      where: { organizer: { userId } },
      orderBy: { updatedAt: "desc" },
      include: eventInclude,
    });
    return events.map(mapEvent);
  }

  async findOwned(eventId: string, userId: string) {
    return this.findOwnedWith(this.prisma, eventId, userId);
  }

  private async updateMaterial(input: {
    readonly eventId: string;
    readonly userId: string;
    readonly expectedVersion: number;
    readonly workflowState: "INCOMPLETE_DRAFT" | "PREVIEW_READY";
    readonly data: Prisma.EventUpdateManyMutationInput;
    readonly action: string;
    readonly requestId?: string | undefined;
    readonly metadata?: Prisma.InputJsonValue | undefined;
  }): Promise<EventRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
        },
        data: {
          ...input.data,
          ...invalidatedApproval,
          workflowState: input.workflowState,
          version: { increment: 1 },
          contentRevision: { increment: 1 },
        },
      });
      if (result.count !== 1) return null;
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.userId,
          action: input.action,
          eventId: input.eventId,
          requestId: input.requestId,
          metadata: input.metadata,
        }),
      });
      return this.findOwnedWith(transaction, input.eventId, input.userId);
    });
  }

  async updateDetails(input: Parameters<EventRepository["updateDetails"]>[0]) {
    return this.updateMaterial({
      eventId: input.eventId,
      userId: input.userId,
      expectedVersion: input.expectedVersion,
      workflowState: input.workflowState,
      data: {
        title: input.title,
        description: input.description,
        slug: input.slug,
      },
      action: "EVENT_DETAILS_UPDATED",
      requestId: input.audit.requestId,
    });
  }

  async updateSchedule(
    input: Parameters<EventRepository["updateSchedule"]>[0],
  ) {
    return this.updateMaterial({
      eventId: input.eventId,
      userId: input.userId,
      expectedVersion: input.expectedVersion,
      workflowState: input.workflowState,
      data: {
        localStartsAt: input.localStartsAt,
        localEndsAt: input.localEndsAt,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
      },
      action: "EVENT_SCHEDULE_UPDATED",
      requestId: input.audit.requestId,
    });
  }

  async updateLocation(
    input: Parameters<EventRepository["updateLocation"]>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
        },
        data: {
          privacyMode: input.privacyMode,
          ...invalidatedApproval,
          workflowState: input.workflowState,
          version: { increment: 1 },
          contentRevision: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      const location = input.location;
      const coordinates =
        location.latitude === null || location.longitude === null
          ? null
          : Prisma.sql`ST_SetSRID(ST_MakePoint(${location.longitude}, ${location.latitude}), 4326)::geography`;
      await transaction.$executeRaw`
        INSERT INTO "event_locations" (
          "event_id", "address_line_1", "address_line_2", "city", "region",
          "postal_code", "country_code", "normalized_address", "latitude",
          "longitude", "coordinates", "timezone", "provider_place_id",
          "provider_name", "provider_version", "provider_attribution",
          "resolution_source", "confirmation_status", "confirmed_by_user_id",
          "confirmed_at", "public_zone", "precision", "confidence",
          "validation_status"
        ) VALUES (
          ${input.eventId}::uuid, ${location.addressLine1}, ${location.addressLine2},
          ${location.city}, ${location.region}, ${location.postalCode},
          ${location.countryCode}, ${location.normalizedAddress}, ${location.latitude},
          ${location.longitude},
          ${coordinates},
          ${location.timezone}, ${location.providerPlaceId}, ${location.providerName},
          ${location.providerVersion}, ${location.providerAttribution},
          ${location.resolutionSource}::"location_resolution_source",
          ${location.confirmationStatus}::"location_confirmation_status",
          ${location.confirmedByUserId}::uuid, ${location.confirmedAt},
          ${location.publicZone},
          ${location.precision}, ${location.confidence},
          ${location.validationStatus}::"location_validation_status"
        )
        ON CONFLICT ("event_id") DO UPDATE SET
          "address_line_1" = EXCLUDED."address_line_1",
          "address_line_2" = EXCLUDED."address_line_2",
          "city" = EXCLUDED."city",
          "region" = EXCLUDED."region",
          "postal_code" = EXCLUDED."postal_code",
          "country_code" = EXCLUDED."country_code",
          "normalized_address" = EXCLUDED."normalized_address",
          "latitude" = EXCLUDED."latitude",
          "longitude" = EXCLUDED."longitude",
          "coordinates" = EXCLUDED."coordinates",
          "timezone" = EXCLUDED."timezone",
          "provider_place_id" = EXCLUDED."provider_place_id",
          "provider_name" = EXCLUDED."provider_name",
          "provider_version" = EXCLUDED."provider_version",
          "provider_attribution" = EXCLUDED."provider_attribution",
          "resolution_source" = EXCLUDED."resolution_source",
          "confirmation_status" = EXCLUDED."confirmation_status",
          "confirmed_by_user_id" = EXCLUDED."confirmed_by_user_id",
          "confirmed_at" = EXCLUDED."confirmed_at",
          "public_zone" = EXCLUDED."public_zone",
          "precision" = EXCLUDED."precision",
          "confidence" = EXCLUDED."confidence",
          "validation_status" = EXCLUDED."validation_status",
          "updated_at" = CURRENT_TIMESTAMP
      `;
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.userId,
          action: "EVENT_LOCATION_UPDATED",
          eventId: input.eventId,
          requestId: input.audit.requestId,
          metadata: {
            privacyMode: input.privacyMode,
            validationStatus: location.validationStatus,
            providerName: location.providerName,
          },
        }),
      });
      return this.findOwnedWith(transaction, input.eventId, input.userId);
    });
  }

  async createPhotoReservation(
    input: Parameters<EventRepository["createPhotoReservation"]>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
        },
        data: { version: { increment: 1 } },
      });
      if (event.count !== 1) return null;
      const maximum = await transaction.eventPhoto.count({
        where: { eventId: input.eventId },
      });
      await transaction.eventPhoto.create({
        data: {
          id: input.photoId,
          eventId: input.eventId,
          sortOrder: maximum,
          stagingObjectKey: input.stagingObjectKey,
          sourceContentType: input.sourceContentType,
          uploadReservation: {
            create: {
              id: input.reservationId,
              eventId: input.eventId,
              stagingObjectKey: input.stagingObjectKey,
              expiresAt: input.expiresAt,
            },
          },
        },
      });
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.userId,
          action: "EVENT_PHOTO_UPLOAD_RESERVED",
          eventId: input.eventId,
          requestId: input.audit.requestId,
          metadata: { photoId: input.photoId },
        }),
      });
      return this.findOwnedWith(transaction, input.eventId, input.userId);
    });
  }

  async findPhotoReservation(
    input: Parameters<EventRepository["findPhotoReservation"]>[0],
  ) {
    const reservation = await this.prisma.uploadReservation.findFirst({
      where: {
        id: input.reservationId,
        photoId: input.photoId,
        eventId: input.eventId,
        event: { organizer: { userId: input.userId } },
      },
      include: { photo: true, event: { select: { version: true } } },
    });
    return reservation
      ? {
          id: reservation.id,
          eventId: reservation.eventId,
          photoId: reservation.photoId,
          stagingObjectKey: reservation.stagingObjectKey,
          expiresAt: reservation.expiresAt,
          consumedAt: reservation.consumedAt,
          sourceContentType: reservation.photo.sourceContentType,
          expectedVersion: reservation.event.version,
        }
      : null;
  }

  async markPhotoProcessing(
    input: Parameters<EventRepository["markPhotoProcessing"]>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
        },
        data: { version: { increment: 1 } },
      });
      if (event.count !== 1) return false;
      const photo = await transaction.eventPhoto.updateMany({
        where: {
          id: input.photoId,
          eventId: input.eventId,
          status: "RESERVED",
          uploadReservation: {
            is: {
              id: input.reservationId,
              consumedAt: null,
              expiresAt: { gt: input.now },
            },
          },
        },
        data: { status: "PROCESSING", errorCode: null },
      });
      if (photo.count !== 1) {
        throw new Error("Photo reservation is not active");
      }
      return true;
    });
  }

  async completePhoto(input: Parameters<EventRepository["completePhoto"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
        },
        data: {
          ...invalidatedApproval,
          workflowState: input.workflowState,
          version: { increment: 1 },
          contentRevision: { increment: 1 },
        },
      });
      if (event.count !== 1) return null;
      const photo = input.photo;
      const changed = await transaction.eventPhoto.updateMany({
        where: {
          id: input.photoId,
          eventId: input.eventId,
          status: "PROCESSING",
          uploadReservation: {
            is: { id: input.reservationId, consumedAt: null },
          },
        },
        data: {
          status: "READY",
          stagingObjectKey: null,
          dashboardThumbnailKey: photo.dashboardThumbnailKey,
          listingCardKey: photo.listingCardKey,
          galleryKey: photo.galleryKey,
          coverDisplayKey: photo.coverDisplayKey,
          dashboardThumbnailHash: photo.dashboardThumbnailHash,
          listingCardHash: photo.listingCardHash,
          galleryHash: photo.galleryHash,
          coverDisplayHash: photo.coverDisplayHash,
          sourceContentType: photo.sourceContentType,
          sourceSize: photo.sourceSize,
          width: photo.width,
          height: photo.height,
          errorCode: null,
          readyAt: input.now,
        },
      });
      if (changed.count !== 1)
        throw new Error("Photo processing state changed");
      await transaction.uploadReservation.update({
        where: { id: input.reservationId },
        data: { consumedAt: input.now },
      });
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.userId,
          action: "EVENT_PHOTO_READY",
          eventId: input.eventId,
          requestId: input.audit.requestId,
          metadata: { photoId: input.photoId },
        }),
      });
      return this.findOwnedWith(transaction, input.eventId, input.userId);
    });
  }

  async failPhoto(input: Parameters<EventRepository["failPhoto"]>[0]) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.eventPhoto.updateMany({
        where: {
          id: input.photoId,
          eventId: input.eventId,
          status: { in: ["RESERVED", "PROCESSING", "UPLOADED"] },
          event: { organizer: { userId: input.userId } },
        },
        data: { status: "FAILED", errorCode: input.errorCode },
      });
      await transaction.uploadReservation.updateMany({
        where: {
          id: input.reservationId,
          eventId: input.eventId,
          photoId: input.photoId,
          consumedAt: null,
          event: { organizer: { userId: input.userId } },
        },
        data: { consumedAt: input.now },
      });
    });
  }

  async setCover(input: Parameters<EventRepository["setCover"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
          photos: { some: { id: input.photoId, status: "READY" } },
        },
        data: {
          ...invalidatedApproval,
          workflowState: input.workflowState,
          version: { increment: 1 },
          contentRevision: { increment: 1 },
        },
      });
      if (result.count !== 1) return null;
      await transaction.event.update({
        where: { id: input.eventId },
        data: { coverPhoto: { connect: { id: input.photoId } } },
      });
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.userId,
          action: "EVENT_COVER_PHOTO_SELECTED",
          eventId: input.eventId,
          requestId: input.audit.requestId,
          metadata: { photoId: input.photoId },
        }),
      });
      return this.findOwnedWith(transaction, input.eventId, input.userId);
    });
  }

  async reorderPhotos(input: Parameters<EventRepository["reorderPhotos"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
        },
        data: {
          ...invalidatedApproval,
          workflowState: input.workflowState,
          version: { increment: 1 },
          contentRevision: { increment: 1 },
        },
      });
      if (event.count !== 1) return null;
      for (const [sortOrder, photoId] of input.photoIds.entries()) {
        const changed = await transaction.eventPhoto.updateMany({
          where: { id: photoId, eventId: input.eventId },
          data: { sortOrder },
        });
        if (changed.count !== 1) throw new Error("Photo ordering changed");
      }
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.userId,
          action: "EVENT_PHOTOS_REORDERED",
          eventId: input.eventId,
          requestId: input.audit.requestId,
          metadata: { photoCount: input.photoIds.length },
        }),
      });
      return this.findOwnedWith(transaction, input.eventId, input.userId);
    });
  }

  async deletePhoto(input: Parameters<EventRepository["deletePhoto"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const photo = await transaction.eventPhoto.findFirst({
        where: {
          id: input.photoId,
          eventId: input.eventId,
          event: {
            version: input.expectedVersion,
            organizer: { userId: input.userId },
            publication: { is: null },
          },
        },
        include: { event: { select: { coverPhotoId: true } } },
      });
      if (!photo) return null;
      const updated = await transaction.event.updateMany({
        where: {
          id: input.eventId,
          version: input.expectedVersion,
          organizer: { userId: input.userId },
          publication: { is: null },
        },
        data: {
          ...invalidatedApproval,
          workflowState: input.workflowState,
          version: { increment: 1 },
          contentRevision: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      if (photo.event.coverPhotoId === photo.id) {
        await transaction.event.update({
          where: { id: input.eventId },
          data: { coverPhoto: { disconnect: true } },
        });
      }
      await transaction.eventPhoto.delete({ where: { id: photo.id } });
      await transaction.auditEntry.create({
        data: auditData({
          userId: input.userId,
          action: "EVENT_PHOTO_DELETED",
          eventId: input.eventId,
          requestId: input.audit.requestId,
          metadata: { photoId: input.photoId },
        }),
      });
      const event = await this.findOwnedWith(
        transaction,
        input.eventId,
        input.userId,
      );
      if (!event) throw new Error("Owned event disappeared");
      return {
        event,
        objectKeys: [
          photo.stagingObjectKey,
          photo.dashboardThumbnailKey,
          photo.listingCardKey,
          photo.galleryKey,
          photo.coverDisplayKey,
        ].filter((key): key is string => Boolean(key)),
      };
    });
  }

  async approve(input: Parameters<EventRepository["approve"]>[0]) {
    return this.prisma.$transaction(
      async (transaction) => {
        const event = await transaction.event.findFirst({
          where: {
            id: input.eventId,
            version: input.expectedVersion,
            contentRevision: input.contentRevision,
            organizer: {
              userId: input.principal.id,
              status: "COMPLETE",
            },
            publication: { is: null },
          },
          select: { id: true, organizerId: true },
        });
        if (!event) return null;
        const approval = await transaction.eventApproval.create({
          data: {
            eventId: event.id,
            organizerId: event.organizerId,
            acceptedByUserId: input.principal.id,
            contentRevision: input.contentRevision,
            approvalDigest: input.digest,
            termsVersion: input.termsVersion,
            termsAcceptedAt: input.now,
            approvedAt: input.now,
          },
        });
        const updated = await transaction.event.updateMany({
          where: {
            id: event.id,
            version: input.expectedVersion,
            contentRevision: input.contentRevision,
            organizer: { userId: input.principal.id },
            publication: { is: null },
          },
          data: {
            workflowState: "APPROVED_FOR_PAYMENT",
            approvalStatus: "APPROVED",
            approvedRevision: input.contentRevision,
            approvalDigest: input.digest,
            approvedAt: input.now,
            termsVersion: input.termsVersion,
            termsAcceptedAt: input.now,
            termsAcceptedByUserId: input.principal.id,
            currentApprovalId: approval.id,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new Error("Event approval changed concurrently");
        await transaction.auditEntry.create({
          data: auditData({
            userId: input.principal.id,
            action: "EVENT_REVISION_APPROVED",
            eventId: event.id,
            requestId: input.audit.requestId,
            metadata: {
              contentRevision: input.contentRevision,
              termsVersion: input.termsVersion,
              digestAlgorithm: "SHA-256",
            },
          }),
        });
        return this.findOwnedWith(transaction, event.id, input.principal.id);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findPhotoVariantForPrincipal(
    input: Parameters<EventRepository["findPhotoVariantForPrincipal"]>[0],
  ) {
    const photo = await this.prisma.eventPhoto.findFirst({
      where: {
        id: input.photoId,
        status: "READY",
        ...(!input.administrator
          ? {
              OR: [
                {
                  event: {
                    publication: { isNot: null },
                    canceledAt: null,
                    removedAt: null,
                  },
                },
                ...(input.userId
                  ? [{ event: { organizer: { userId: input.userId } } }]
                  : []),
              ],
            }
          : {}),
      },
      select: {
        dashboardThumbnailKey: true,
        listingCardKey: true,
        galleryKey: true,
        coverDisplayKey: true,
        event: {
          select: {
            publication: { select: { id: true } },
            canceledAt: true,
            removedAt: true,
          },
        },
      },
    });
    if (!photo) return null;
    const objectKey = {
      thumbnail: photo.dashboardThumbnailKey,
      card: photo.listingCardKey,
      gallery: photo.galleryKey,
      cover: photo.coverDisplayKey,
    }[input.variant];
    return objectKey
      ? {
          objectKey,
          contentType: "image/webp",
          public: Boolean(
            photo.event.publication &&
            !photo.event.canceledAt &&
            !photo.event.removedAt,
          ),
        }
      : null;
  }
}
