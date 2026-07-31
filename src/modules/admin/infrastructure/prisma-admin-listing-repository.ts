import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { parsePublicationSnapshot } from "@/modules/payments";

import type { AdminCursor, AdminListingFilter } from "../domain/types";
import { AdminConflictError, AdminNotFoundError } from "../domain/errors";

function searchWhere(search: string): Prisma.EventWhereInput {
  if (!search) return {};
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      search,
    )
  ) {
    return { id: search };
  }
  return {
    OR: [
      { title: { contains: search, mode: "insensitive" } },
      {
        organizer: {
          user: {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

function filterWhere(filter: AdminListingFilter): Prisma.EventWhereInput {
  switch (filter) {
    case "drafts":
      return {
        deletedAt: null,
        canceledAt: null,
        removedAt: null,
        publication: { is: null },
      };
    case "canceled":
      return { canceledAt: { not: null } };
    case "deleted":
      return { deletedAt: { not: null } };
    case "removed":
      return { removedAt: { not: null } };
    default:
      return {
        deletedAt: null,
        canceledAt: null,
        removedAt: null,
        ...(filter === "published" || filter === "ended"
          ? { publication: { isNot: null } }
          : {}),
      };
  }
}

const listingInclude = {
  organizer: {
    select: {
      user: { select: { id: true, displayName: true, email: true } },
    },
  },
  photos: { select: { status: true } },
  paymentAttempts: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      paymentState: true,
      checkoutState: true,
      fulfillmentState: true,
    },
  },
  publication: {
    select: {
      id: true,
      snapshot: true,
      publishedAt: true,
      canonicalPath: true,
    },
  },
} satisfies Prisma.EventInclude;

export class PrismaAdminListingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: {
    search: string;
    filter: AdminListingFilter;
    cursor: AdminCursor | null;
    limit: number;
    now: Date;
  }) {
    const cursorWhere: Prisma.EventWhereInput = input.cursor
      ? {
          OR: [
            { updatedAt: { lt: input.cursor.at } },
            { updatedAt: input.cursor.at, id: { lt: input.cursor.id } },
          ],
        }
      : {};
    const candidates = await this.prisma.event.findMany({
      where: {
        AND: [
          searchWhere(input.search),
          filterWhere(input.filter),
          cursorWhere,
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take:
        input.filter === "published" || input.filter === "ended"
          ? Math.min(input.limit * 10 + 1, 501)
          : input.limit + 1,
      include: listingInclude,
    });
    const filtered = candidates.filter((event) => {
      if (input.filter !== "published" && input.filter !== "ended") return true;
      try {
        const ended =
          new Date(
            parsePublicationSnapshot(event.publication!.snapshot).projection
              .endsAt,
          ) <= input.now;
        return input.filter === "ended" ? ended : !ended;
      } catch {
        return false;
      }
    });
    const hasMore = filtered.length > input.limit;
    const rows = filtered.slice(0, input.limit);
    return {
      rows,
      next: hasMore
        ? { at: rows.at(-1)!.updatedAt, id: rows.at(-1)!.id }
        : null,
    };
  }

  async detail(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                emailVerifiedAt: true,
                status: true,
              },
            },
          },
        },
        location: true,
        photos: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            status: true,
            sortOrder: true,
            width: true,
            height: true,
            errorCode: true,
            dashboardThumbnailKey: true,
            listingCardKey: true,
            galleryKey: true,
            coverDisplayKey: true,
            readyAt: true,
            createdAt: true,
          },
        },
        paymentAttempts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            expectedAmount: true,
            expectedCurrency: true,
            checkoutState: true,
            paymentState: true,
            fulfillmentState: true,
            expiresAt: true,
            paidAt: true,
            fulfilledAt: true,
            lastReconciledAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        publication: true,
      },
    });
  }

  async auditTimeline(id: string) {
    return this.prisma.auditEntry.findMany({
      where: {
        targetType: "EVENT",
        targetId: id,
        action: {
          in: [
            "EVENT_CREATED",
            "EVENT_UPDATED",
            "EVENT_APPROVED",
            "CHECKOUT_CREATED",
            "PAYMENT_SUCCEEDED",
            "EVENT_PUBLISHED",
            "EVENT_CANCELED",
            "EVENT_DRAFT_DELETED",
            "EVENT_REMOVED",
            "EVENT_REMOVAL_REVERSED",
            "EVENT_MEDIA_PURGED",
          ],
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        occurredAt: true,
        requestId: true,
      },
    });
  }

  async purgeStatus(id: string) {
    return this.prisma.durableJob.findFirst({
      where: {
        type: "EVENT_MEDIA_PURGE",
        payload: { path: ["eventId"], equals: id },
      },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        attempts: true,
        completedAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(input: {
    id: string;
    expectedVersion: number;
    reason: string;
    confirmation: string;
    actorId: string;
    requestId?: string;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "events" WHERE "id" = ${input.id}::uuid FOR UPDATE`,
        );
        const event = await transaction.event.findUnique({
          where: { id: input.id },
          include: { publication: { select: { canonicalPath: true } } },
        });
        if (!event) throw new AdminNotFoundError();
        if (
          input.confirmation !== "REMOVE" &&
          input.confirmation !== (event.title ?? "")
        ) {
          throw new AdminConflictError(
            "INVALID_CONFIRMATION",
            "Enter the exact event title or REMOVE.",
          );
        }
        if (event.removedAt) return { event, idempotent: true };
        if (event.deletedAt || event.canceledAt) {
          throw new AdminConflictError(
            "INVALID_LIFECYCLE",
            "Deleted or organizer-canceled listings cannot be removed.",
          );
        }
        if (event.version !== input.expectedVersion) {
          throw new AdminConflictError(
            "STALE_VERSION",
            "The listing changed. Refresh and try again.",
          );
        }
        const removedAt = new Date();
        const updated = await transaction.event.update({
          where: { id: event.id },
          data: {
            removedAt,
            removalReason: input.reason,
            version: { increment: 1 },
          },
          include: { publication: { select: { canonicalPath: true } } },
        });
        await transaction.auditEntry.create({
          data: {
            actorUserId: input.actorId,
            action: "EVENT_REMOVED",
            targetType: "EVENT",
            targetId: event.id,
            requestId: input.requestId ?? null,
            metadata: { reason: input.reason },
          },
        });
        return { event: updated, idempotent: false };
      },
      { isolationLevel: "Serializable" },
    );
  }

  async restore(input: {
    id: string;
    expectedVersion: number;
    confirmation: string;
    actorId: string;
    requestId?: string;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "events" WHERE "id" = ${input.id}::uuid FOR UPDATE`,
        );
        const event = await transaction.event.findUnique({
          where: { id: input.id },
          include: {
            organizer: { include: { user: true } },
            location: true,
            photos: true,
            publication: { include: { paymentAttempt: true } },
          },
        });
        if (!event) throw new AdminNotFoundError();
        if (
          input.confirmation !== "RESTORE" &&
          input.confirmation !== (event.title ?? "")
        ) {
          throw new AdminConflictError(
            "INVALID_CONFIRMATION",
            "Enter the exact event title or RESTORE.",
          );
        }
        if (
          !event.removedAt ||
          event.deletedAt ||
          event.canceledAt ||
          !event.publication ||
          event.version !== input.expectedVersion ||
          event.organizer.user.status !== "ACTIVE" ||
          !event.organizer.user.emailVerifiedAt ||
          event.publication.eventId !== event.id ||
          event.publication.publicId !== event.publicId ||
          event.publication.paymentAttempt.paymentState !== "PAID" ||
          event.publication.paymentAttempt.fulfillmentState !== "FULFILLED"
        ) {
          throw new AdminConflictError(
            "NOT_RESTORABLE",
            "This listing does not meet the restoration policy.",
          );
        }
        let snapshot;
        try {
          snapshot = parsePublicationSnapshot(event.publication.snapshot);
        } catch {
          throw new AdminConflictError(
            "NOT_RESTORABLE",
            "The retained publication snapshot is invalid.",
          );
        }
        const expectedPrefix =
          event.eventType === "ESTATE_SALE" ? "/estate-sales/" : "/yard-sales/";
        if (
          snapshot.projection.eventType !== event.eventType ||
          snapshot.projection.path !== event.publication.canonicalPath ||
          !event.publication.canonicalPath.startsWith(expectedPrefix) ||
          !event.publication.canonicalPath.endsWith(event.publicId)
        ) {
          throw new AdminConflictError(
            "NOT_RESTORABLE",
            "The publication identity is inconsistent.",
          );
        }
        const referencedIds = new Set([
          ...snapshot.projection.gallery.map((photo) => photo.id),
          snapshot.projection.coverPhotoUrl.split("/")[2] ?? "",
        ]);
        const photos = new Map(event.photos.map((photo) => [photo.id, photo]));
        const validPhotos = [...referencedIds].every((id) => {
          const photo = photos.get(id);
          return (
            photo?.status === "READY" &&
            photo.dashboardThumbnailKey &&
            photo.listingCardKey &&
            photo.galleryKey &&
            photo.coverDisplayKey
          );
        });
        const notEnded =
          new Date(snapshot.projection.endsAt).getTime() > Date.now();
        if (
          !validPhotos ||
          (notEnded &&
            (!event.location ||
              event.location.confirmationStatus !== "CONFIRMED"))
        ) {
          throw new AdminConflictError(
            "NOT_RESTORABLE",
            "Required publication photos or confirmed location are unavailable.",
          );
        }
        const removalAudit = await transaction.auditEntry.findFirst({
          where: {
            targetType: "EVENT",
            targetId: event.id,
            action: "EVENT_REMOVED",
          },
          orderBy: { occurredAt: "desc" },
          select: { id: true },
        });
        const updated = await transaction.event.update({
          where: { id: event.id },
          data: {
            removedAt: null,
            removalReason: null,
            version: { increment: 1 },
          },
          include: { publication: true },
        });
        await transaction.auditEntry.create({
          data: {
            actorUserId: input.actorId,
            action: "EVENT_REMOVAL_REVERSED",
            targetType: "EVENT",
            targetId: event.id,
            requestId: input.requestId ?? null,
            metadata: {
              originalRemovalAuditId: removalAudit?.id.toString() ?? null,
            },
          },
        });
        return updated;
      },
      { isolationLevel: "Serializable" },
    );
  }
}
