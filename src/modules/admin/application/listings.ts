import type { AuthPrincipal, CurrentSession } from "@/modules/auth";
import { parsePublicationSnapshot } from "@/modules/payments";

import { authorizeAdminService, authorizeRecentAdminService } from "./security";
import { encodeAdminCursor } from "./criteria";
import { AdminNotFoundError } from "../domain/errors";
import type { PrismaAdminListingRepository } from "../infrastructure/prisma-admin-listing-repository";

function lifecycle(event: {
  deletedAt: Date | null;
  canceledAt: Date | null;
  removedAt: Date | null;
}) {
  return event.deletedAt
    ? "DELETED_DRAFT"
    : event.canceledAt
      ? "CANCELED"
      : event.removedAt
        ? "REMOVED"
        : "ACTIVE";
}

function publicationStatus(
  publication: { snapshot: unknown } | null,
  now: Date,
) {
  if (!publication) return "UNPUBLISHED";
  try {
    return new Date(
      parsePublicationSnapshot(publication.snapshot).projection.endsAt,
    ) <= now
      ? "ENDED"
      : "PUBLISHED";
  } catch {
    return "INVALID_SNAPSHOT";
  }
}

export class AdminListingDirectory {
  constructor(
    private readonly repository: PrismaAdminListingRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(
    principal: AuthPrincipal | null,
    criteria: Omit<Parameters<PrismaAdminListingRepository["list"]>[0], "now">,
  ) {
    authorizeAdminService(principal);
    const result = await this.repository.list({
      ...criteria,
      now: this.clock(),
    });
    return {
      rows: result.rows.map((event) => ({
        id: event.id,
        title: event.title ?? "Untitled listing",
        organizer: event.organizer.user,
        eventType: event.eventType,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        workflowState: event.workflowState,
        lifecycle: lifecycle(event),
        payment: event.paymentAttempts[0] ?? null,
        publicationStatus: publicationStatus(event.publication, this.clock()),
        photoCount: event.photos.length,
        readyPhotoCount: event.photos.filter(
          (photo) => photo.status === "READY",
        ).length,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      })),
      nextCursor: result.next ? encodeAdminCursor(result.next) : null,
    };
  }
}

export class AdminEventDetail {
  constructor(private readonly repository: PrismaAdminListingRepository) {}

  async get(principal: AuthPrincipal | null, id: string) {
    authorizeAdminService(principal);
    const [event, audit, purge] = await Promise.all([
      this.repository.detail(id),
      this.repository.auditTimeline(id),
      this.repository.purgeStatus(id),
    ]);
    if (!event) throw new AdminNotFoundError();
    let snapshot: ReturnType<typeof parsePublicationSnapshot> | null = null;
    if (event.publication) {
      try {
        snapshot = parsePublicationSnapshot(event.publication.snapshot);
      } catch {
        snapshot = null;
      }
    }
    return {
      id: event.id,
      publicId: event.publicId,
      title: event.title ?? "Untitled listing",
      description: event.description,
      eventType: event.eventType,
      origin: event.origin,
      workflowState: event.workflowState,
      approvalStatus: event.approvalStatus,
      version: event.version,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      localStartsAt: event.localStartsAt,
      localEndsAt: event.localEndsAt,
      timezone: event.timezone,
      privacyMode: event.privacyMode,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      lifecycle: lifecycle(event),
      canceledAt: event.canceledAt,
      cancellationReason: event.cancellationReason,
      deletedAt: event.deletedAt,
      removedAt: event.removedAt,
      removalReason: event.removalReason,
      organizer: event.organizer.user,
      location: event.location
        ? {
            addressLine1: event.location.addressLine1,
            addressLine2: event.location.addressLine2,
            city: event.location.city,
            region: event.location.region,
            postalCode: event.location.postalCode,
            countryCode: event.location.countryCode,
            confirmationStatus: event.location.confirmationStatus,
            publicProjection:
              event.privacyMode === "EXACT_ADDRESS"
                ? `${event.location.addressLine1}, ${event.location.city}, ${event.location.region} ${event.location.postalCode}`
                : `${event.location.city}, ${event.location.region}`,
          }
        : null,
      photos: event.photos.map((photo) => ({
        id: photo.id,
        status: photo.status,
        sortOrder: photo.sortOrder,
        width: photo.width,
        height: photo.height,
        readyAt: photo.readyAt,
        previewUrl:
          photo.status === "READY" ? `/media/${photo.id}/thumbnail` : null,
        processingMessage:
          photo.status === "FAILED"
            ? photo.errorCode === "MEDIA_PURGED"
              ? "Media was deliberately purged."
              : "Photo processing failed."
            : null,
      })),
      payments: event.paymentAttempts,
      publication: event.publication
        ? {
            id: event.publication.id,
            paymentAttemptId: event.publication.paymentAttemptId,
            publicId: event.publication.publicId,
            canonicalPath: event.publication.canonicalPath,
            publishedAt: event.publication.publishedAt,
            snapshot,
          }
        : null,
      audit: audit.map((entry) => ({
        id: entry.id.toString(),
        action: entry.action,
        occurredAt: entry.occurredAt,
        requestId: entry.requestId,
      })),
      purge: purge
        ? {
            status: purge.status,
            attempts: purge.attempts,
            completedAt: purge.completedAt,
            updatedAt: purge.updatedAt,
          }
        : null,
      capabilities: {
        remove: lifecycle(event) === "ACTIVE",
        restore: lifecycle(event) === "REMOVED" && event.publication !== null,
      },
    };
  }
}

export class AdminListingModeration {
  constructor(
    private readonly repository: PrismaAdminListingRepository,
    private readonly expireCheckout: (
      eventId: string,
      requestId?: string,
    ) => Promise<void>,
    private readonly revalidate: (paths: readonly string[]) => void,
  ) {}

  async remove(
    session: CurrentSession | null,
    input: {
      id: string;
      expectedVersion: number;
      reason: string;
      confirmation: string;
      requestId?: string;
    },
  ) {
    const admin = authorizeRecentAdminService(session).principal;
    const result = await this.repository.remove({
      id: input.id,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      confirmation: input.confirmation,
      actorId: admin.id,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
    if (!result.idempotent) {
      await this.expireCheckout(input.id, input.requestId).catch(
        () => undefined,
      );
      if (result.event.publication?.canonicalPath) {
        this.revalidate([result.event.publication.canonicalPath, "/search"]);
      }
    }
    return result;
  }

  async restore(
    session: CurrentSession | null,
    input: {
      id: string;
      expectedVersion: number;
      confirmation: string;
      requestId?: string;
    },
  ) {
    const admin = authorizeRecentAdminService(session).principal;
    const event = await this.repository.restore({
      id: input.id,
      expectedVersion: input.expectedVersion,
      confirmation: input.confirmation,
      actorId: admin.id,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
    if (!event.publication) throw new AdminNotFoundError();
    this.revalidate([event.publication.canonicalPath, "/search"]);
    return event;
  }
}
