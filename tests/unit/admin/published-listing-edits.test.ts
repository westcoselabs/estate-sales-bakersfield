import { describe, expect, it, vi } from "vitest";

import { AdminListingDirectory } from "@/modules/admin/application/listings";
import { PrismaAdminListingRepository } from "@/modules/admin/infrastructure/prisma-admin-listing-repository";
import { editedPublicationSnapshot } from "@/modules/events/application/published-edits";
import {
  createPublicationSnapshot,
  parsePublicationSnapshot,
} from "@/modules/payments/application/publication";

import { readyEvent } from "../events/fixtures";
import { principal } from "../payments/fixtures";

vi.mock("@/platform/database/admin-session-authorization", () => ({
  authorizedAdministratorSession: vi.fn(async () => new Date()),
}));

describe("admin handling of edited publications", () => {
  it("classifies an event from its current closing time", async () => {
    const original = createPublicationSnapshot(readyEvent());
    const event = readyEvent({
      endsAt: new Date("2026-07-25T17:00:00.000Z"),
    });
    const directory = new AdminListingDirectory(
      {
        list: vi.fn(async () => ({
          rows: [
            {
              ...event,
              publication: { snapshot: original },
              organizer: { user: {} },
              paymentAttempts: [],
              photos: event.photos,
            },
          ],
          next: null,
        })),
      } as never,
      () => new Date("2026-07-25T18:00:00.000Z"),
    );

    const result = await directory.list(
      { ...principal, role: "SUPER_ADMIN" },
      { search: "", filter: "active", cursor: null, limit: 20 },
    );

    expect(result.rows[0]?.publicationStatus).toBe("ENDED");
  });

  it("restores using the current replacement photo snapshot", async () => {
    const originalEvent = readyEvent({
      id: "10000000-0000-4000-8000-000000000001",
      localStartsAt: "2099-07-25T09:00",
      localEndsAt: "2099-07-25T15:00",
      startsAt: new Date("2099-07-25T16:00:00.000Z"),
      endsAt: new Date("2099-07-25T22:00:00.000Z"),
    });
    const original = createPublicationSnapshot(originalEvent);
    const replacement = {
      ...originalEvent.photos[0]!,
      id: "replacement-photo",
    };
    const editedEvent = {
      ...originalEvent,
      photos: [replacement],
      coverPhotoId: replacement.id,
    };
    const current = parsePublicationSnapshot(
      editedPublicationSnapshot(original, editedEvent),
    );
    const stored = {
      ...editedEvent,
      removedAt: new Date(),
      publishedSnapshot: current,
      organizer: {
        user: { status: "ACTIVE", emailVerifiedAt: new Date() },
      },
      publication: {
        eventId: editedEvent.id,
        publicId: editedEvent.publicId,
        canonicalPath: original.projection.path,
        snapshot: original,
        paymentAttempt: {
          paymentState: "PAID",
          fulfillmentState: "FULFILLED",
        },
      },
    };
    const transaction = {
      $queryRaw: vi.fn(async () => []),
      event: {
        findUnique: vi.fn(async () => stored),
        update: vi.fn(async () => stored),
      },
      auditEntry: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => undefined),
      },
    };
    const repository = new PrismaAdminListingRepository({
      $transaction: async (callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
    } as never);

    await expect(
      repository.restore({
        id: stored.id,
        expectedVersion: stored.version,
        confirmation: "RESTORE",
        actorId: principal.id,
        actorSessionId: "20000000-0000-4000-8000-000000000002",
      }),
    ).resolves.toMatchObject({ id: stored.id });
  });
});
